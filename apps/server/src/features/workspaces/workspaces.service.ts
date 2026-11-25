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
 * 아래의 모든 쓰기는 호출자의 권한을 같은 문 안에서 호출자 멤버십 행에 대한 EXISTS로 확인한다
 * (WS 규칙 7). 쓰기가 아무것도 바꾸지 않았을 때 뒤따르는 조회는 어떤 오류를 알릴지만 정한다.
 */
type Failure = "NOT_FOUND" | "FORBIDDEN" | "USER_NOT_FOUND" | "ALREADY_MEMBER";
export type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: Failure): Result<never> => ({ ok: false, error });

/** 호출자가 범위 안 행의 워크스페이스에서 `roles` 중 하나를 맡고 있다는 조건이다. */
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
  if (!row) throw new Error("쓰기 뒤에 멤버 행이 없다");
  return row;
}

export async function createWorkspace(
  db: Database,
  ownerId: string,
  name: string,
): Promise<WorkspaceSummary> {
  return db.transaction(async (tx) => {
    const [workspace] = await tx.insert(workspaces).values({ name }).returning();
    if (!workspace) throw new Error("INSERT가 행을 돌려주지 않았다");
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

/** 워크스페이스와 그 멤버들을 돌려준다. 멤버가 아니면 null이다. */
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

/** 소유자와 관리자가 이미 있는 계정을 `member`로 더한다(WS 규칙 2, 3). */
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

/** 역할은 소유자만 바꾸고, 소유자 자신의 역할은 바꾸지 않는다(WS 규칙 2). */
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
 * 소유자가 아니면 누구든 나갈 수 있다. 소유자는 다른 누구든 내보내고, 관리자는 일반 멤버를
 * 내보낸다. 나간 사람의 글과 댓글은 남는다(WS 규칙 8).
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

/** 멤버십, 글, 댓글, 좋아요, 알림이 ON DELETE CASCADE로 함께 지워진다. */
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
