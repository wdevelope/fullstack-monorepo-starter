import { oc } from "@orpc/contract";
import * as z from "zod";

/** 호출하는 클라이언트 종류다. 리프레시 토큰을 주고받는 방식과 액세스 토큰의 audience를 정한다. */
export const CLIENT_KIND_HEADER = "x-client-kind";
export const clientKindSchema = z.enum(["web", "native"]);
export type ClientKind = z.infer<typeof clientKindSchema>;

/** 웹 클라이언트는 리프레시 토큰을 응답 본문 대신 이 HttpOnly 쿠키로 받는다. */
export const REFRESH_COOKIE_NAME = "refresh_token";

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const passwordSchema = z.string().min(8).max(128);
export const nicknameSchema = z.string().trim().min(2).max(20);

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  nickname: z.string(),
  createdAt: z.date(),
});
export type User = z.infer<typeof userSchema>;

export const sessionSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  accessTokenExpiresAt: z.date(),
  /** 리프레시 토큰은 네이티브 클라이언트만 본문으로 받는다. 웹 클라이언트는 HttpOnly 쿠키로 받는다. */
  refreshToken: z.string().optional(),
});
export type Session = z.infer<typeof sessionSchema>;

/** 네이티브 클라이언트는 리프레시 토큰을 본문에 담아 보낸다. 웹 클라이언트는 비워 두고 쿠키에 맡긴다. */
const refreshTokenInput = z.object({ refreshToken: z.string().min(1).max(200).optional() });

/** 같은 IP에서 인증 절차를 너무 자주 부르면 받는다(요청 횟수 제한, RATE-2). */
const tooManyRequests = {
  TOO_MANY_REQUESTS: {
    status: 429,
    message: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
    data: z.object({ retryAfterSeconds: z.number().int().positive() }),
  },
} as const;

export const authContract = {
  signup: oc
    .input(z.object({ email: emailSchema, password: passwordSchema, nickname: nicknameSchema }))
    .output(sessionSchema)
    .errors({
      EMAIL_TAKEN: { status: 409, message: "이미 가입한 이메일이에요." },
      ...tooManyRequests,
    }),

  login: oc
    .input(z.object({ email: emailSchema, password: z.string().min(1).max(128) }))
    .output(sessionSchema)
    .errors({
      INVALID_CREDENTIALS: { status: 401, message: "이메일 또는 비밀번호가 맞지 않아요." },
      ACCOUNT_LOCKED: {
        status: 423,
        message: "로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.",
        data: z.object({ retryAfterSeconds: z.number().int().positive() }),
      },
      ...tooManyRequests,
    }),

  refresh: oc
    .input(refreshTokenInput)
    .output(sessionSchema)
    .errors({
      INVALID_REFRESH_TOKEN: { status: 401, message: "다시 로그인해 주세요." },
      ...tooManyRequests,
    }),

  logout: oc.input(refreshTokenInput).output(z.object({})),

  me: oc.output(userSchema),
};
