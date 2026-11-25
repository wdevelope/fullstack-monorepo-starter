import { implement, ORPCError } from "@orpc/server";
import { contract, type ClientKind } from "@starter/contracts";

import type { PasswordHasher } from "../features/auth/password.ts";
import { verifyAccessToken } from "../features/auth/tokens.ts";
import type { Database } from "./db.ts";
import type { NotificationHub } from "./notification-hub.ts";

/** 시작할 때(테스트에서는 테스트마다) 한 번 만드는 오래 사는 의존성이다. */
export interface Dependencies {
  db: Database;
  now: () => Date;
  passwords: PasswordHasher;
  jwtSecret: string;
  cookieSecure: boolean;
  /** PostgreSQL NOTIFY 메시지를 이 인스턴스의 열린 알림 스트림들에 나눠 보낸다. */
  notificationHub: NotificationHub;
}

/** 모든 절차가 받는 컨텍스트다. 의존성에 이 요청의 정보를 더한 것이다. */
export interface RequestContext extends Dependencies {
  clientKind: ClientKind;
  /** 요청 횟수 제한이 세는 클라이언트 IP(RATE 규칙 5). */
  clientIp: string;
  reqHeaders: Headers;
  resHeaders: Headers;
}

export const base = implement(contract).$context<RequestContext>();

async function accessToken(context: RequestContext) {
  const header = context.reqHeaders.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifyAccessToken(
    header.slice("Bearer ".length),
    context.clientKind,
    context.jwtSecret,
    context.now(),
  );
}

/** 이 클라이언트 종류에 맞는 유효한 액세스 토큰이 없으면 호출을 UNAUTHORIZED로 거부한다. */
export const requireUser = base.middleware(async ({ context, next }) => {
  const claims = await accessToken(context);
  if (!claims) throw new ORPCError("UNAUTHORIZED");
  return next({ context: { userId: claims.userId, accessTokenExpiresAt: claims.expiresAt } });
});

/** 로그인한 호출자에게 더 보여 줄 것("내가 좋아요 했는지" 등)이 있는 공개 읽기에 쓴다. */
export const optionalUser = base.middleware(async ({ context, next }) => {
  return next({ context: { userId: (await accessToken(context))?.userId ?? null } });
});
