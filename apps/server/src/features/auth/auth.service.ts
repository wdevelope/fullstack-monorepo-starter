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
 * 비밀번호를 확인하고 실패 횟수를 센다. 다섯 번째 연속 실패에 계정을 잠근다. 횟수 갱신은
 * UPDATE 한 번이므로 동시에 시도해도 잠금을 건너뛸 수 없다.
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
    // 실제 확인과 같은 시간을 써서, 응답 시간으로 어떤 이메일이 가입했는지 드러나지 않게 한다.
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

/** 새 리프레시 토큰 패밀리(로그인마다 하나)를 시작하고 해시하기 전의 토큰을 돌려준다. */
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
 * 리프레시 토큰을 같은 패밀리의 새 토큰으로 바꾼다. 이미 쓴 토큰이 오면 누군가 사본을 가진
 * 것이므로 패밀리 전체를 폐기하고, 양쪽 모두 다시 로그인해야 한다.
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
    // 두 요청이 같은 토큰으로 경쟁해도 revoked_at 조건 때문에 이 UPDATE는 한쪽만 이긴다.
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

/** 이 토큰의 패밀리를 폐기해 토큰을 가진 기기를 로그아웃시킨다. 모르는 토큰은 무시한다. */
export async function revokeRefreshToken(db: Database, token: string, now: Date) {
  const [current] = await db
    .select({ familyId: refreshTokens.familyId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashRefreshToken(token)));
  if (current) await revokeFamily(db, current.familyId, now);
}
