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
export async function signAccessToken(userId: string, clientKind: ClientKind, secret: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ACCESS_TOKEN_TTL_SECONDS;
  const token = await sign(
    { sub: userId, aud: clientKind, iss: ISSUER, iat: issuedAt, exp: expiresAt },
    secret,
    "HS256",
  );
  return { token, expiresAt: new Date(expiresAt * 1000) };
}

/** Returns the user id, or null when the token is missing, malformed, expired or for another audience. */
export async function verifyAccessToken(
  token: string,
  clientKind: ClientKind,
  secret: string,
): Promise<string | null> {
  try {
    const payload = await verify(token, secret, { alg: "HS256", aud: clientKind, iss: ISSUER });
    return typeof payload.sub === "string" ? payload.sub : null;
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
