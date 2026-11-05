import { implement, ORPCError } from "@orpc/server";
import { contract, type ClientKind } from "@starter/contracts";

import type { PasswordHasher } from "../features/auth/password.ts";
import { verifyAccessToken } from "../features/auth/tokens.ts";
import type { Database } from "./db.ts";
import type { NotificationHub } from "./notification-hub.ts";

/** Long-lived dependencies, created once at startup (or per test). */
export interface Dependencies {
  db: Database;
  now: () => Date;
  passwords: PasswordHasher;
  jwtSecret: string;
  cookieSecure: boolean;
  /** Fans PostgreSQL NOTIFY messages out to this instance's open notification streams. */
  notificationHub: NotificationHub;
}

/** What every procedure receives: the dependencies plus this request's details. */
export interface RequestContext extends Dependencies {
  clientKind: ClientKind;
  reqHeaders: Headers;
  resHeaders: Headers;
}

export const base = implement(contract).$context<RequestContext>();

async function accessToken(context: RequestContext) {
  const header = context.reqHeaders.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifyAccessToken(header.slice("Bearer ".length), context.clientKind, context.jwtSecret);
}

/** Rejects the call with UNAUTHORIZED unless a valid access token for this client kind is present. */
export const requireUser = base.middleware(async ({ context, next }) => {
  const claims = await accessToken(context);
  if (!claims) throw new ORPCError("UNAUTHORIZED");
  return next({ context: { userId: claims.userId, accessTokenExpiresAt: claims.expiresAt } });
});

/** For public reads that show something extra (such as "liked by me") to signed-in callers. */
export const optionalUser = base.middleware(async ({ context, next }) => {
  return next({ context: { userId: (await accessToken(context))?.userId ?? null } });
});
