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

describe("가입", () => {
  it("AUTH-1 웹 가입은 HttpOnly 리프레시 쿠키를 설정하고 본문에는 토큰을 넣지 않는다", async () => {
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

  it("AUTH-1 네이티브 가입은 본문으로 리프레시 토큰을 돌려주고 쿠키를 설정하지 않는다", async () => {
    const jar = new CookieJar();
    const session = await t.client({ kind: "native", jar }).auth.signup(signupInput);

    expect(session.refreshToken).toEqual(expect.any(String));
    expect(jar.received).toEqual([]);
  });

  it("AUTH-2 대소문자와 상관없이 이미 가입한 이메일을 거부한다", async () => {
    const api = t.client({ kind: "native" });
    await api.auth.signup(signupInput);

    await expect(
      api.auth.signup({ ...signupInput, email: "ALICE@example.com", nickname: "alice2" }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN", status: 409 });
  });

  it("AUTH-3 틀린 입력은 데이터베이스에 닿기 전에 거부한다", async () => {
    await expect(
      t.client({ kind: "native" }).auth.signup({ ...signupInput, password: "short" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("로그인과 잠금", () => {
  beforeEach(() => t.client({ kind: "native" }).auth.signup(signupInput));
  const api = () => t.client({ kind: "native" });
  const wrong = () => api().auth.login({ ...credentials, password: "wrong-password" });

  it("AUTH-4 맞는 비밀번호로 로그인하고 실패 횟수를 0으로 되돌린다", async () => {
    await expect(wrong()).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(wrong()).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    const session = await api().auth.login(credentials);
    expect(session.user.email).toBe("alice@example.com");

    const [user] = await t.db.select().from(users).where(eq(users.email, credentials.email));
    expect(user?.failedLoginCount).toBe(0);
  });

  it("AUTH-5 틀린 비밀번호와 없는 이메일에 같은 오류를 돌려준다", async () => {
    await expect(wrong()).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
    await expect(
      api().auth.login({ email: "nobody@example.com", password: "password1" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
  });

  it("AUTH-6 다섯 번째 연속 실패에 계정을 잠그고, 맞는 비밀번호도 받지 않는다", async () => {
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

  it("AUTH-7 15분 잠금이 지나면 다시 로그인된다", async () => {
    for (let attempt = 1; attempt <= 5; attempt++) await wrong().catch(() => {});

    t.advanceClock(15 * 60_000);
    const session = await api().auth.login(credentials);
    expect(session.user.email).toBe(credentials.email);
  });
});

describe("리프레시 토큰 회전", () => {
  async function nativeSession() {
    return t.client({ kind: "native" }).auth.signup(signupInput);
  }
  const refresh = (refreshToken: string) =>
    t.client({ kind: "native" }).auth.refresh({ refreshToken });

  it("AUTH-8 리프레시 토큰을 회전하고 옛 토큰을 폐기한다", async () => {
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

  it("AUTH-8 웹 리프레시는 쿠키를 읽고 새 쿠키로 바꾼다", async () => {
    const jar = new CookieJar();
    const web = t.client({ kind: "web", jar });
    await web.auth.signup(signupInput);
    const before = jar.cookies.get(REFRESH_COOKIE_NAME);

    const session = await web.auth.refresh({});
    expect(session.refreshToken).toBeUndefined();
    expect(jar.cookies.get(REFRESH_COOKIE_NAME)).not.toBe(before);
  });

  it("AUTH-9 회전한 토큰을 다시 쓰면 패밀리 전체를 폐기한다", async () => {
    const first = await nativeSession();
    const second = await refresh(first.refreshToken!);

    await expect(refresh(first.refreshToken!)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
    await expect(refresh(second.refreshToken!)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("AUTH-9 같은 토큰으로 동시에 리프레시하면 하나만 성공한다", async () => {
    const first = await nativeSession();
    const results = await Promise.allSettled([
      refresh(first.refreshToken!),
      refresh(first.refreshToken!),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("AUTH-10 모르거나 만료된 리프레시 토큰을 거부한다", async () => {
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

  it("AUTH-15 웹 클라이언트 헤더가 없으면 리프레시 쿠키를 무시한다", async () => {
    const jar = new CookieJar();
    await t.client({ kind: "web", jar }).auth.signup(signupInput);

    await expect(t.client({ kind: null, jar }).auth.refresh({})).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });
});

describe("로그아웃과 액세스 토큰", () => {
  it("AUTH-11 웹 로그아웃은 패밀리를 폐기하고 쿠키를 지운다", async () => {
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

  it("AUTH-11 네이티브 로그아웃은 제시한 리프레시 토큰을 폐기한다", async () => {
    const native = t.client({ kind: "native" });
    const session = await native.auth.signup(signupInput);

    await native.auth.logout({ refreshToken: session.refreshToken });

    await expect(native.auth.refresh({ refreshToken: session.refreshToken })).rejects.toMatchObject(
      { code: "INVALID_REFRESH_TOKEN" },
    );
  });

  it("AUTH-12 유효한 액세스 토큰 없는 보호된 호출을 거부한다", async () => {
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

  it("AUTH-12 액세스 토큰은 서버 시계로 15분이 지나면 거부한다", async () => {
    const { api } = await t.signUp();

    t.advanceClock(15 * 60_000 - 1_000);
    await expect(api.auth.me()).resolves.toMatchObject({ nickname: expect.any(String) });

    t.advanceClock(1_000);
    await expect(api.auth.me()).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("AUTH-12 발급 시각이 서버 시계보다 미래인 액세스 토큰은 거부한다", async () => {
    const session = await t.client({ kind: "native" }).auth.signup(signupInput);
    const issuedAt = Math.floor(t.now().getTime() / 1000) + 60;
    const fromTheFuture = await sign(
      {
        sub: session.user.id,
        aud: "native",
        iss: "fullstack-monorepo-starter",
        iat: issuedAt,
        exp: issuedAt + 15 * 60,
      },
      TEST_JWT_SECRET,
      "HS256",
    );

    await expect(
      t.client({ kind: "native", accessToken: fromTheFuture }).auth.me(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("AUTH-13 다른 클라이언트 종류에서 쓴 액세스 토큰을 거부한다", async () => {
    const session = await t.client({ kind: "web" }).auth.signup(signupInput);

    await expect(
      t.client({ kind: "native", accessToken: session.accessToken }).auth.me(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
