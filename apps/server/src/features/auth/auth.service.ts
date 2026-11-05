import { randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import { refreshTokens, users } from "../../db/schema.ts";
import type { Database } from "../../platform/db.ts";
import type { PasswordHasher } from "./password.ts";
import { generateRefreshToken, hashRefreshToken, REFRESH_TOKEN_TTL_MS } from "./tokens.ts";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

const publicUser = {
  id: users.id,
  email: users.email,
  nickname: users.nickname,
  createdAt: users.createdAt,
};
export type PublicUser = { id: string; email: string; nickname: string; createdAt: Date };

export async function createUser(
  db: Database,
  input: { email: string; passwordHash: string; nickname: string },
): Promise<PublicUser | null> {
  const [user] = await db
    .insert(users)
    .values(input)
    .onConflictDoNothing({ target: users.email })
    .returning(publicUser);
  return user ?? null;
}

export async function findUser(db: Database, id: string): Promise<PublicUser | null> {
  const [user] = await db.select(publicUser).from(users).where(eq(users.id, id));
  return user ?? null;
}

type LoginResult =
  | { status: "ok"; user: PublicUser }
  | { status: "invalid" }
  | { status: "locked"; retryAfterSeconds: number };

function secondsUntil(until: Date, now: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));
}

/**
 * Checks the password and keeps the failure counter. The fifth consecutive failure locks the
 * account; the counter update is a single UPDATE so concurrent attempts cannot skip the lock.
 */
export async function attemptLogin(
  db: Database,
  passwords: PasswordHasher,
  dummyHash: string,
  now: Date,
  email: string,
  password: string,
): Promise<LoginResult> {
  const [user] = await db
    .select({ ...publicUser, passwordHash: users.passwordHash, lockedUntil: users.lockedUntil })
    .from(users)
    .where(eq(users.email, email));

  if (!user) {
    // Spend the same time as a real check so response times do not reveal which emails exist.
    await passwords.verify(dummyHash, password);
    return { status: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    return { status: "locked", retryAfterSeconds: secondsUntil(user.lockedUntil, now) };
  }

  if (await passwords.verify(user.passwordHash, password)) {
    await db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
    const { passwordHash: _, lockedUntil: __, ...rest } = user;
    return { status: "ok", user: rest };
  }

  const lockUntil = new Date(now.getTime() + LOCK_DURATION_MS);
  const reachesLimit = sql`${users.failedLoginCount} + 1 >= ${MAX_FAILED_LOGINS}`;
  const [updated] = await db
    .update(users)
    .set({
      failedLoginCount: sql`CASE WHEN ${reachesLimit} THEN 0 ELSE ${users.failedLoginCount} + 1 END`,
      lockedUntil: sql`CASE WHEN ${reachesLimit} THEN ${lockUntil.toISOString()}::timestamptz ELSE NULL END`,
    })
    .where(eq(users.id, user.id))
    .returning({ lockedUntil: users.lockedUntil });

  if (updated?.lockedUntil) {
    return { status: "locked", retryAfterSeconds: secondsUntil(updated.lockedUntil, now) };
  }
  return { status: "invalid" };
}

/** Starts a new refresh-token family (one per sign-in) and returns the raw token. */
export async function startRefreshFamily(db: Database, userId: string, now: Date) {
  const token = generateRefreshToken();
  await db.insert(refreshTokens).values({
    userId,
    familyId: randomUUID(),
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
  });
  return token;
}

async function revokeFamily(db: Database, familyId: string, now: Date) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

/**
 * Exchanges a refresh token for a new one in the same family. A token that was already used
 * means someone else holds a copy, so the whole family is revoked and both parties must sign in.
 */
export async function rotateRefreshToken(
  db: Database,
  token: string,
  now: Date,
): Promise<{ userId: string; token: string } | null> {
  const [current] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashRefreshToken(token)));

  if (!current) return null;
  if (current.revokedAt) {
    await revokeFamily(db, current.familyId, now);
    return null;
  }
  if (current.expiresAt <= now) return null;

  return db.transaction(async (tx) => {
    const nextId = randomUUID();
    // The revoked_at guard makes this the single winner when two requests race with one token.
    const [claimed] = await tx
      .update(refreshTokens)
      .set({ revokedAt: now, replacedById: nextId })
      .where(and(eq(refreshTokens.id, current.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });

    if (!claimed) {
      await revokeFamily(tx, current.familyId, now);
      return null;
    }

    const next = generateRefreshToken();
    await tx.insert(refreshTokens).values({
      id: nextId,
      userId: current.userId,
      familyId: current.familyId,
      tokenHash: hashRefreshToken(next),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    });
    return { userId: current.userId, token: next };
  });
}

/** Signs out the device that holds this token by revoking its family. Unknown tokens are ignored. */
export async function revokeRefreshToken(db: Database, token: string, now: Date) {
  const [current] = await db
    .select({ familyId: refreshTokens.familyId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashRefreshToken(token)));
  if (current) await revokeFamily(db, current.familyId, now);
}
