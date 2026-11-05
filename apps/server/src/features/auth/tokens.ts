import { createHash, randomBytes } from "node:crypto";

import type { ClientKind } from "@starter/contracts";
import { sign, verify } from "hono/jwt";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const ISSUER = "fullstack-monorepo-starter";

/**
 * The audience is the client kind, so a token issued to the web app is rejected when replayed
 * from a native client and the other way round.
 */
export async function signAccessToken(
  userId: string,
  clientKind: ClientKind,
  secret: string,
  ttlSeconds = ACCESS_TOKEN_TTL_SECONDS,
) {
  const issuedAt = Math.floor(Date.now() / 1000);
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
  /** Long-lived responses such as the notification stream end here. */
  expiresAt: Date;
}

/** Returns the claims, or null when the token is missing, malformed, expired or for another audience. */
export async function verifyAccessToken(
  token: string,
  clientKind: ClientKind,
  secret: string,
): Promise<AccessTokenClaims | null> {
  try {
    const payload = await verify(token, secret, { alg: "HS256", aud: clientKind, iss: ISSUER });
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    return { userId: payload.sub, expiresAt: new Date(payload.exp * 1000) };
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored, so a database leak does not leak usable refresh tokens. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
