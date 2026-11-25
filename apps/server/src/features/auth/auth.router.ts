import { ORPCError } from "@orpc/server";
import { REFRESH_COOKIE_NAME, type Session } from "@starter/contracts";
import { parse, serialize } from "hono/utils/cookie";

import { checkRateLimit } from "../../platform/rate-limit.ts";
import { base, requireUser, type RequestContext } from "../../platform/context.ts";
import {
  attemptLogin,
  createUser,
  findUser,
  revokeRefreshToken,
  rotateRefreshToken,
  startRefreshFamily,
  type PublicUser,
} from "./auth.service.ts";
import { REFRESH_TOKEN_TTL_MS, signAccessToken } from "./tokens.ts";

const COOKIE_PATH = "/rpc/auth";

/** 웹 클라이언트는 리프레시 토큰을 HttpOnly 쿠키에 두고, 네이티브 클라이언트는 본문으로 받는다. */
function setRefreshCookie(context: RequestContext, token: string, maxAgeSeconds: number) {
  context.resHeaders.append(
    "set-cookie",
    serialize(REFRESH_COOKIE_NAME, token, {
      path: COOKIE_PATH,
      httpOnly: true,
      sameSite: "Strict",
      secure: context.cookieSecure,
      maxAge: maxAgeSeconds,
    }),
  );
}

/** 호출자가 웹 클라이언트라고 밝힐 때만 쿠키를 인정한다(AUTH 규칙 8 참고). */
function presentedRefreshToken(context: RequestContext, bodyToken: string | undefined) {
  if (context.clientKind === "native") return bodyToken;
  const cookies = parse(context.reqHeaders.get("cookie") ?? "", REFRESH_COOKIE_NAME);
  return cookies[REFRESH_COOKIE_NAME];
}

async function respondWithSession(
  context: RequestContext,
  user: PublicUser,
  refreshToken: string,
): Promise<Session> {
  const access = await signAccessToken(
    user.id,
    context.clientKind,
    context.jwtSecret,
    context.now(),
  );
  const session: Session = {
    user,
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
  };
  if (context.clientKind === "web") {
    setRefreshCookie(context, refreshToken, REFRESH_TOKEN_TTL_MS / 1000);
    return session;
  }
  return { ...session, refreshToken };
}

/** 프로세스마다 한 번 만든다. 없는 이메일로 로그인해도 실제 로그인과 같은 시간이 걸리게 한다. */
const dummyHashes = new WeakMap<object, Promise<string>>();
function dummyHashFor(context: RequestContext) {
  let hash = dummyHashes.get(context.passwords);
  if (!hash) {
    hash = context.passwords.hash("dummy password for timing");
    dummyHashes.set(context.passwords, hash);
  }
  return hash;
}

export const authRouter = {
  signup: base.auth.signup.handler(async ({ input, context, errors }) => {
    const retryAfterSeconds = await checkRateLimit(context, "signup");
    if (retryAfterSeconds) throw errors.TOO_MANY_REQUESTS({ data: { retryAfterSeconds } });
    const user = await createUser(context.db, {
      email: input.email,
      nickname: input.nickname,
      passwordHash: await context.passwords.hash(input.password),
    });
    if (!user) throw errors.EMAIL_TAKEN();
    const refreshToken = await startRefreshFamily(context.db, user.id, context.now());
    return respondWithSession(context, user, refreshToken);
  }),

  login: base.auth.login.handler(async ({ input, context, errors }) => {
    // 비밀번호 확인과 계정 실패 횟수보다 먼저 거부한다(RATE 규칙 2).
    const retryAfterSeconds = await checkRateLimit(context, "login");
    if (retryAfterSeconds) throw errors.TOO_MANY_REQUESTS({ data: { retryAfterSeconds } });
    const now = context.now();
    const result = await attemptLogin(
      context.db,
      context.passwords,
      await dummyHashFor(context),
      now,
      input.email,
      input.password,
    );
    if (result.status === "invalid") throw errors.INVALID_CREDENTIALS();
    if (result.status === "locked") {
      throw errors.ACCOUNT_LOCKED({ data: { retryAfterSeconds: result.retryAfterSeconds } });
    }
    const refreshToken = await startRefreshFamily(context.db, result.user.id, now);
    return respondWithSession(context, result.user, refreshToken);
  }),

  refresh: base.auth.refresh.handler(async ({ input, context, errors }) => {
    const retryAfterSeconds = await checkRateLimit(context, "refresh");
    if (retryAfterSeconds) throw errors.TOO_MANY_REQUESTS({ data: { retryAfterSeconds } });
    const presented = presentedRefreshToken(context, input.refreshToken);
    const rotated = presented && (await rotateRefreshToken(context.db, presented, context.now()));
    const user = rotated && (await findUser(context.db, rotated.userId));
    if (!rotated || !user) {
      if (context.clientKind === "web") setRefreshCookie(context, "", 0);
      throw errors.INVALID_REFRESH_TOKEN();
    }
    return respondWithSession(context, user, rotated.token);
  }),

  logout: base.auth.logout.handler(async ({ input, context }) => {
    const presented = presentedRefreshToken(context, input.refreshToken);
    if (presented) await revokeRefreshToken(context.db, presented, context.now());
    if (context.clientKind === "web") setRefreshCookie(context, "", 0);
    return {};
  }),

  me: base.auth.me.use(requireUser).handler(async ({ context }) => {
    const user = await findUser(context.db, context.userId);
    if (!user) throw new ORPCError("UNAUTHORIZED");
    return user;
  }),
};
