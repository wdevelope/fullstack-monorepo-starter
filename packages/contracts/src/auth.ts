import { oc } from "@orpc/contract";
import * as z from "zod";

/** Which client is calling. It decides how the refresh token travels and which audience the access token carries. */
export const CLIENT_KIND_HEADER = "x-client-kind";
export const clientKindSchema = z.enum(["web", "native"]);
export type ClientKind = z.infer<typeof clientKindSchema>;

/** Web clients receive the refresh token in this HttpOnly cookie instead of the response body. */
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
  /** Only native clients get the refresh token in the body. Web clients get an HttpOnly cookie. */
  refreshToken: z.string().optional(),
});
export type Session = z.infer<typeof sessionSchema>;

/** Native clients send the refresh token in the body. Web clients leave it out and rely on the cookie. */
const refreshTokenInput = z.object({ refreshToken: z.string().min(1).max(200).optional() });

export const authContract = {
  signup: oc
    .input(z.object({ email: emailSchema, password: passwordSchema, nickname: nicknameSchema }))
    .output(sessionSchema)
    .errors({ EMAIL_TAKEN: { status: 409, message: "This email is already registered." } }),

  login: oc
    .input(z.object({ email: emailSchema, password: z.string().min(1).max(128) }))
    .output(sessionSchema)
    .errors({
      INVALID_CREDENTIALS: { status: 401, message: "Email or password is incorrect." },
      ACCOUNT_LOCKED: {
        status: 423,
        message: "Too many failed attempts. Try again later.",
        data: z.object({ retryAfterSeconds: z.number().int().positive() }),
      },
    }),

  refresh: oc
    .input(refreshTokenInput)
    .output(sessionSchema)
    .errors({ INVALID_REFRESH_TOKEN: { status: 401, message: "Please sign in again." } }),

  logout: oc.input(refreshTokenInput).output(z.object({})),

  me: oc.output(userSchema),
};
