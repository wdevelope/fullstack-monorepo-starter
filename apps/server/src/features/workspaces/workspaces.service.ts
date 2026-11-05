import type {
  WorkspaceDetail,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceSummary,
} from "@starter/contracts";
import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";

import { users, workspaceMembers, workspaces } from "../../db/schema.ts";
import type { Database, Executor } from "../../platform/db.ts";

/**
 * Every write below carries the caller's permission as an EXISTS on their membership row in the
 * same statement (WS rule 7). When a write changes nothing, the follow-up lookups only decide
 * which error to report.
 */
type Failure = "NOT_FOUND" | "FORBIDDEN" | "USER_NOT_FOUND" | "ALREADY_MEMBER";
export type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: Failure): Result<never> => ({ ok: false, error });

/** The caller holds one of `roles` in the workspace of the row in scope. */
function callerHas(workspaceId: SQLValue, userId: string, roles: WorkspaceRole[]) {
  return sql`EXISTS (
    SELECT 1 FROM workspace_members caller
    WHERE caller.workspace_id = ${workspaceId} AND caller.user_id = ${userId}
      AND caller.role IN (${sql.join(
        roles.map((role) => sql`${role}`),
        sql`, `,
      )})
  )`;
}
type SQLValue = string | typeof workspaces.id;

const roleOrder = sql`CASE ${workspaceMembers.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`;

const memberFields = {
  user: { id: users.id, nickname: users.nickname },
  role: workspaceMembers.role,
  joinedAt: workspaceMembers.createdAt,
};

async function roleOf(db: Executor, workspaceId: string, userId: string) {
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  return row?.role ?? null;
}

async function findMember(db: Executor, workspaceId: string, userId: string) {
  const [row] = await db
    .select(memberFields)
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  if (!row) throw new Error("Member row missing after write");
  return row;
}

export async function createWorkspace(
  db: Database,
  ownerId: string,
  name: string,
): Promise<WorkspaceSummary> {
  return db.transaction(async (tx) => {
    const [workspace] = await tx.insert(workspaces).values({ name }).returning();
    if (!workspace) throw new Error("Insert returned no row");
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: workspace.id, userId: ownerId, role: "owner" });
    return {
      id: workspace.id,
      name: workspace.name,
      role: "owner",
      createdAt: workspace.createdAt,
    };
  });
}

export async function listWorkspaces(db: Database, userId: string): Promise<WorkspaceSummary[]> {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      role: workspaceMembers.role,
      createdAt: workspaces.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(desc(workspaces.createdAt), desc(workspaces.id));
}

/** The workspace with its members, or null for non-members. */
export async function getWorkspace(
  db: Database,
  id: string,
  viewerId: string,
): Promise<WorkspaceDetail | null> {
  const rows = await db
    .select({
      workspace: { id: workspaces.id, name: workspaces.name, createdAt: workspaces.createdAt },
      ...memberFields,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, id),
        callerHas(id, viewerId, ["owner", "admin", "member"]),
      ),
    )
    .orderBy(roleOrder, asc(workspaceMembers.createdAt), asc(users.id));

  const first = rows[0];
  const me = rows.find((row) => row.user.id === viewerId);
  if (!first || !me) return null;
  return {
    ...first.workspace,
    myRole: me.role,
    members: rows.map(({ user, role, joinedAt }) => ({ user, role, joinedAt })),
  };
}

/** The owner and admins add an existing account as a `member` (WS rules 2 and 3). */
export async function addMember(
  db: Database,
  workspaceId: string,
  actorId: string,
  email: string,
): Promise<Result<WorkspaceMember>> {
  const inserted = await db.execute<{ user_id: string }>(sql`
    INSERT INTO ${workspaceMembers} (workspace_id, user_id, role)
    SELECT ${workspaceId}::uuid, ${users.id}, 'member'
    FROM ${users}
    WHERE ${users.email} = ${email} AND ${callerHas(workspaceId, actorId, ["owner", "admin"])}
    ON CONFLICT DO NOTHING
    RETURNING user_id`);
  const userId = inserted.rows[0]?.user_id;
  if (userId) return ok(await findMember(db, workspaceId, userId));

  const actorRole = await roleOf(db, workspaceId, actorId);
  if (!actorRole) return fail("NOT_FOUND");
  if (actorRole === "member") return fail("FORBIDDEN");
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  return fail(user ? "ALREADY_MEMBER" : "USER_NOT_FOUND");
}

/** Only the owner changes roles, and never their own (WS rule 2). */
export async function updateMemberRole(
  db: Database,
  input: { workspaceId: string; userId: string; role: "admin" | "member" },
  actorId: string,
): Promise<Result<WorkspaceMember>> {
  const { workspaceId, userId, role } = input;
  const updated = await db
    .update(workspaceMembers)
    .set({ role })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        ne(workspaceMembers.role, "owner"),
        callerHas(workspaceId, actorId, ["owner"]),
      ),
    )
    .returning({ userId: workspaceMembers.userId });
  if (updated.length > 0) return ok(await findMember(db, workspaceId, userId));

  const actorRole = await roleOf(db, workspaceId, actorId);
  if (!actorRole) return fail("NOT_FOUND");
  if (actorRole !== "owner") return fail("FORBIDDEN");
  return fail((await roleOf(db, workspaceId, userId)) ? "FORBIDDEN" : "NOT_FOUND");
}

/**
 * Anyone but the owner may leave. The owner removes anyone else; admins remove plain members.
 * Their posts and comments stay (WS rule 8).
 */
export async function removeMember(
  db: Database,
  input: { workspaceId: string; userId: string },
  actorId: string,
): Promise<Result<null>> {
  const { workspaceId, userId } = input;
  const removed = await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        ne(workspaceMembers.role, "owner"),
        or(
          eq(workspaceMembers.userId, actorId),
          callerHas(workspaceId, actorId, ["owner"]),
          and(eq(workspaceMembers.role, "member"), callerHas(workspaceId, actorId, ["admin"])),
        ),
      ),
    )
    .returning({ userId: workspaceMembers.userId });
  if (removed.length > 0) return ok(null);

  if (!(await roleOf(db, workspaceId, actorId))) return fail("NOT_FOUND");
  return fail((await roleOf(db, workspaceId, userId)) ? "FORBIDDEN" : "NOT_FOUND");
}

/** Memberships, posts, comments, likes and notifications go with it through ON DELETE CASCADE. */
export async function deleteWorkspace(
  db: Database,
  id: string,
  actorId: string,
): Promise<Result<null>> {
  const deleted = await db
    .delete(workspaces)
    .where(and(eq(workspaces.id, id), callerHas(workspaces.id, actorId, ["owner"])))
    .returning({ id: workspaces.id });
  if (deleted.length > 0) return ok(null);
  return fail((await roleOf(db, id, actorId)) ? "FORBIDDEN" : "NOT_FOUND");
}
