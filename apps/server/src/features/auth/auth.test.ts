import { REFRESH_COOKIE_NAME } from "@starter/contracts";
import { eq } from "drizzle-orm";
import { sign } from "hono/jwt";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { CookieJar, createTestApp, TEST_JWT_SECRET } from "../../../test/test-app.ts";
import { refreshTokens, users } from "../../db/schema.ts";
import { hashRefreshToken } from "./tokens.ts";

const t = createTestApp();
beforeEach(() => t.reset());
afterAll(() => t.close());

const credentials = { email: "alice@example.com", password: "password1" };
const signupInput = { ...credentials, nickname: "alice" };

describe("sign-up", () => {
  it("AUTH-1 web sign-up sets an HttpOnly refresh cookie and keeps the token out of the body", async () => {
    const jar = new CookieJar();
    const session = await t.client({ kind: "web", jar }).auth.signup(signupInput);

    expect(session.user).toMatchObject({ email: "alice@example.com", nickname: "alice" });
    expect(session.refreshToken).toBeUndefined();
    expect(jar.cookies.get(REFRESH_COOKIE_NAME)).toBeTruthy();
    expect(jar.received[0]).toMatch(/HttpOnly/);
    expect(jar.received[0]).toMatch(/SameSite=Strict/);
    expect(jar.received[0]).toMatch(/Secure/);
    expect(jar.received[0]).toMatch(/Path=\/rpc\/auth/);

    const me = await t.client({ kind: "web", accessToken: session.accessToken }).auth.me();
    expect(me.id).toBe(session.user.id);
  });

  it("AUTH-1 native sign-up returns the refresh token in the body and sets no cookie", async () => {
    const jar = new CookieJar();
    const session = await t.client({ kind: "native", jar }).auth.signup(signupInput);

    expect(session.refreshToken).toEqual(expect.any(String));
    expect(jar.received).toEqual([]);
  });

  it("AUTH-2 rejects an email that is already registered, ignoring letter case", async () => {
    const api = t.client({ kind: "native" });
    await api.auth.signup(signupInput);

    await expect(
      api.auth.signup({ ...signupInput, email: "ALICE@example.com", nickname: "alice2" }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN", status: 409 });
  });

  it("AUTH-3 rejects invalid input before it reaches the database", async () => {
    await expect(
      t.client({ kind: "native" }).auth.signup({ ...signupInput, password: "short" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("login and lockout", () => {
  beforeEach(() => t.client({ kind: "native" }).auth.signup(signupInput));
  const api = () => t.client({ kind: "native" });
  const wrong = () => api().auth.login({ ...credentials, password: "wrong-password" });

  it("AUTH-4 logs in with the right password and resets the failure counter", async () => {
    await expect(wrong()).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(wrong()).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    const session = await api().auth.login(credentials);
    expect(session.user.email).toBe("alice@example.com");

    const [user] = await t.db.select().from(users).where(eq(users.email, credentials.email));
    expect(user?.failedLoginCount).toBe(0);
  });

  it("AUTH-5 returns the same error for a wrong password and an unknown email", async () => {
    await expect(wrong()).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
    await expect(
      api().auth.login({ email: "nobody@example.com", password: "password1" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
  });

  it("AUTH-6 locks the account on the fifth consecutive failure, even for the right password", async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(wrong()).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    }
    await expect(wrong()).rejects.toMatchObject({
      code: "ACCOUNT_LOCKED",
      status: 423,
      data: { retryAfterSeconds: 900 },
    });

    t.advanceClock(60_000);
    await expect(api().auth.login(credentials)).rejects.toMatchObject({
      code: "ACCOUNT_LOCKED",
      data: { retryAfterSeconds: 840 },
    });
  });

  it("AUTH-7 lets the user in again once the 15-minute lock has passed", async () => {
    for (let attempt = 1; attempt <= 5; attempt++) await wrong().catch(() => {});

    t.advanceClock(15 * 60_000);
    const session = await api().auth.login(credentials);
    expect(session.user.email).toBe(credentials.email);
  });
});

describe("refresh rotation", () => {
  async function nativeSession() {
    return t.client({ kind: "native" }).auth.signup(signupInput);
  }
  const refresh = (refreshToken: string) =>
    t.client({ kind: "native" }).auth.refresh({ refreshToken });

  it("AUTH-8 rotates the refresh token and revokes the old one", async () => {
    const first = await nativeSession();
    const second = await refresh(first.refreshToken!);

    expect(second.refreshToken).toEqual(expect.any(String));
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.user.id).toBe(first.user.id);

    const [old] = await t.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(first.refreshToken!)));
    expect(old?.revokedAt).toBeInstanceOf(Date);
  });

  it("AUTH-8 web refresh reads the cookie and replaces it", async () => {
    const jar = new CookieJar();
    const web = t.client({ kind: "web", jar });
    await web.auth.signup(signupInput);
    const before = jar.cookies.get(REFRESH_COOKIE_NAME);

    const session = await web.auth.refresh({});
    expect(session.refreshToken).toBeUndefined();
    expect(jar.cookies.get(REFRESH_COOKIE_NAME)).not.toBe(before);
  });

  it("AUTH-9 revokes the whole family when a rotated token is reused", async () => {
    const first = await nativeSession();
    const second = await refresh(first.refreshToken!);

    await expect(refresh(first.refreshToken!)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
    await expect(refresh(second.refreshToken!)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("AUTH-9 lets only one of two concurrent refreshes with the same token succeed", async () => {
    const first = await nativeSession();
    const results = await Promise.allSettled([
      refresh(first.refreshToken!),
      refresh(first.refreshToken!),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("AUTH-10 rejects an unknown or expired refresh token", async () => {
    await expect(refresh("not-a-real-token")).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
      status: 401,
    });

    const session = await nativeSession();
    t.advanceClock(14 * 24 * 60 * 60_000);
    await expect(refresh(session.refreshToken!)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("AUTH-15 ignores the refresh cookie when the web client header is missing", async () => {
    const jar = new CookieJar();
    await t.client({ kind: "web", jar }).auth.signup(signupInput);

    await expect(t.client({ kind: null, jar }).auth.refresh({})).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });
});

describe("logout and access tokens", () => {
  it("AUTH-11 web logout revokes the family and clears the cookie", async () => {
    const jar = new CookieJar();
    const web = t.client({ kind: "web", jar });
    await web.auth.signup(signupInput);
    const stolen = new CookieJar();
    stolen.cookies.set(REFRESH_COOKIE_NAME, jar.cookies.get(REFRESH_COOKIE_NAME)!);

    await web.auth.logout({});

    expect(jar.cookies.has(REFRESH_COOKIE_NAME)).toBe(false);
    await expect(t.client({ kind: "web", jar: stolen }).auth.refresh({})).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("AUTH-11 native logout revokes the presented refresh token", async () => {
    const native = t.client({ kind: "native" });
    const session = await native.auth.signup(signupInput);

    await native.auth.logout({ refreshToken: session.refreshToken });

    await expect(native.auth.refresh({ refreshToken: session.refreshToken })).rejects.toMatchObject(
      { code: "INVALID_REFRESH_TOKEN" },
    );
  });

  it("AUTH-12 rejects protected calls without a valid access token", async () => {
    const session = await t.client({ kind: "native" }).auth.signup(signupInput);
    const expired = await sign(
      { sub: session.user.id, aud: "native", iss: "fullstack-monorepo-starter", exp: 1 },
      TEST_JWT_SECRET,
      "HS256",
    );

    for (const accessToken of [undefined, "garbage", expired]) {
      await expect(t.client({ kind: "native", accessToken }).auth.me()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        status: 401,
      });
    }
  });

  it("AUTH-13 rejects an access token used by a different client kind", async () => {
    const session = await t.client({ kind: "web" }).auth.signup(signupInput);

    await expect(
      t.client({ kind: "native", accessToken: session.accessToken }).auth.me(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
