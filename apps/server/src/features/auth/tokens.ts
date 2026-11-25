import { createHash, randomBytes } from "node:crypto";

import type { ClientKind } from "@starter/contracts";
import { sign, verify } from "hono/jwt";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const ISSUER = "fullstack-monorepo-starter";

/**
 * audience가 클라이언트 종류이므로, 웹 앱에 발급한 토큰을 네이티브 클라이언트에서 다시 쓰면
 * 거부되고 그 반대도 마찬가지다. 발급 시각은 서버 시계(`context.now()`)를 따른다.
 */
export async function signAccessToken(
  userId: string,
  clientKind: ClientKind,
  secret: string,
  now: Date,
  ttlSeconds = ACCESS_TOKEN_TTL_SECONDS,
) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + ttlSeconds;
  const token = await sign(
    { sub: userId, aud: clientKind, iss: ISSUER, iat: issuedAt, exp: expiresAt },
    secret,
    "HS256",
  );
  return { token, expiresAt: new Date(expiresAt * 1000) };
}

export interface AccessTokenClaims {
  userId: string;
  /** 알림 스트림처럼 오래 이어지는 응답은 이 시각에 끝난다. */
  expiresAt: Date;
}

/**
 * 클레임을 돌려준다. 토큰이 없거나, 형식이 틀렸거나, 만료됐거나, 발급 시각이 미래거나, 다른
 * audience용이면 null이다. 만료·발급 시각은 hono의 실제 시계 대신 서버 시계(`now`)로 검사해서
 * 발급과 같은 시계를 쓴다.
 */
export async function verifyAccessToken(
  token: string,
  clientKind: ClientKind,
  secret: string,
  now: Date,
): Promise<AccessTokenClaims | null> {
  try {
    const payload = await verify(token, secret, {
      alg: "HS256",
      aud: clientKind,
      iss: ISSUER,
      exp: false,
      iat: false,
    });
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    const nowSeconds = now.getTime() / 1000;
    if (payload.exp <= nowSeconds) return null;
    if (typeof payload.iat === "number" && payload.iat > nowSeconds) return null;
    return { userId: payload.sub, expiresAt: new Date(payload.exp * 1000) };
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 이 해시만 저장하므로 데이터베이스가 유출돼도 쓸 수 있는 리프레시 토큰은 새지 않는다. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
