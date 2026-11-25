import { ORPCError } from "@orpc/client";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestApp } from "../../test/test-app.ts";
import { users } from "../db/schema.ts";

const t = createTestApp();
beforeEach(() => t.reset());
afterAll(() => t.close());

const ATTACKER = "203.0.113.7";
const LOGIN_LIMIT = 10;

/** 호출 결과를 "ok" 또는 오류 코드로 돌려준다. */
async function outcome(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return "ok";
  } catch (error) {
    if (error instanceof ORPCError) return error.code;
    throw error;
  }
}

function login(
  ip: string,
  email = `nobody-${crypto.randomUUID()}@example.com`,
  password = "wrong-password",
) {
  return t.client({ kind: "native", ip }).auth.login({ email, password });
}

async function exhaustLogin(ip: string) {
  for (let i = 0; i < LOGIN_LIMIT; i++) await outcome(login(ip));
}

async function registered() {
  await t.client({ kind: "native" }).auth.signup({
    email: "victim@example.com",
    password: "password1",
    nickname: "victim",
  });
  return { email: "victim@example.com", password: "password1" };
}

describe("로그인 횟수 제한", () => {
  it("RATE-1 한 IP가 한 창 안에서 한도만큼 보낸 로그인은 모두 평소처럼 처리된다", async () => {
    const results = [];
    for (let i = 0; i < LOGIN_LIMIT; i++) results.push(await outcome(login(ATTACKER)));
    expect(results).toEqual(Array(LOGIN_LIMIT).fill("INVALID_CREDENTIALS"));
  });

  it("RATE-2 한도를 넘는 로그인은 429와 창이 끝날 때까지 남은 초를 받는다", async () => {
    await exhaustLogin(ATTACKER);
    t.advanceClock(20_000);

    let response: Response | undefined;
    const client = t.client({ kind: "native", ip: ATTACKER, onResponse: (r) => (response = r) });
    await expect(
      client.auth.login({ email: "nobody@example.com", password: "wrong-password" }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      status: 429,
      data: { retryAfterSeconds: 40 },
    });
    expect(response?.headers.get("retry-after")).toBe("40");
  });

  it("RATE-3 한도를 넘은 로그인은 맞는 비밀번호여도 거부하고 계정 실패 횟수를 바꾸지 않는다", async () => {
    const victim = await registered();
    await exhaustLogin(ATTACKER);

    expect(await outcome(login(ATTACKER, victim.email, victim.password))).toBe("TOO_MANY_REQUESTS");
    expect(await outcome(login(ATTACKER, victim.email, "wrong-password"))).toBe(
      "TOO_MANY_REQUESTS",
    );
    const [row] = await t.db
      .select({ failed: users.failedLoginCount, lockedUntil: users.lockedUntil })
      .from(users)
      .where(eq(users.email, victim.email));
    expect(row).toEqual({ failed: 0, lockedUntil: null });
  });

  it("RATE-4 서버 시계로 창이 지나면 같은 IP의 로그인이 다시 처리된다", async () => {
    const victim = await registered();
    await exhaustLogin(ATTACKER);
    t.advanceClock(60_000);

    expect(await outcome(login(ATTACKER, victim.email, victim.password))).toBe("ok");
  });

  it("RATE-5 한 IP가 한도를 다 써도 다른 IP의 로그인은 처리된다", async () => {
    const victim = await registered();
    await exhaustLogin(ATTACKER);

    expect(await outcome(login("198.51.100.20", victim.email, victim.password))).toBe("ok");
  });

  it("RATE-7 한도보다 많은 로그인이 동시에 와도 정확히 한도만큼만 처리된다", async () => {
    const results = await Promise.all(
      Array.from({ length: LOGIN_LIMIT + 5 }, () => outcome(login(ATTACKER))),
    );
    expect(results.filter((r) => r === "INVALID_CREDENTIALS")).toHaveLength(LOGIN_LIMIT);
    expect(results.filter((r) => r === "TOO_MANY_REQUESTS")).toHaveLength(5);
  });

  it("RATE-8 한 IP의 요청을 두 서버 인스턴스에 나눠 보내도 합쳐서 센다", async () => {
    const other = createTestApp();
    try {
      for (let i = 0; i < 6; i++) await outcome(login(ATTACKER));
      const viaOther = () =>
        outcome(
          other
            .client({ kind: "native", ip: ATTACKER })
            .auth.login({ email: "nobody@example.com", password: "wrong-password" }),
        );
      for (let i = 0; i < 4; i++) expect(await viaOther()).toBe("INVALID_CREDENTIALS");
      expect(await viaOther()).toBe("TOO_MANY_REQUESTS");
    } finally {
      await other.close();
    }
  });
});

describe("절차마다 따로 세는 한도", () => {
  it("RATE-6 로그인 한도를 다 써도 같은 IP의 가입과 리프레시는 처리된다", async () => {
    await exhaustLogin(ATTACKER);
    const native = t.client({ kind: "native", ip: ATTACKER });

    const session = await native.auth.signup({
      email: "new@example.com",
      password: "password1",
      nickname: "newbie",
    });
    expect(session.refreshToken).toEqual(expect.any(String));
    expect(await outcome(native.auth.refresh({ refreshToken: session.refreshToken }))).toBe("ok");
  });

  it("RATE-6 가입은 IP당 1시간에 10회를 넘으면 거부된다", async () => {
    const native = t.client({ kind: "native", ip: ATTACKER });
    const signup = (i: number) =>
      outcome(
        native.auth.signup({
          email: `user${i}@example.com`,
          password: "password1",
          nickname: `user${i}`,
        }),
      );
    for (let i = 0; i < 10; i++) expect(await signup(i)).toBe("ok");
    expect(await signup(10)).toBe("TOO_MANY_REQUESTS");
    t.advanceClock(59 * 60_000);
    expect(await signup(11)).toBe("TOO_MANY_REQUESTS");
    t.advanceClock(60_000);
    expect(await signup(12)).toBe("ok");
  });

  it("RATE-6 리프레시는 IP당 1분에 30회를 넘으면 거부된다", async () => {
    const native = t.client({ kind: "native", ip: ATTACKER });
    const refresh = () => outcome(native.auth.refresh({ refreshToken: "not-a-real-token" }));
    for (let i = 0; i < 30; i++) expect(await refresh()).toBe("INVALID_REFRESH_TOKEN");
    expect(await refresh()).toBe("TOO_MANY_REQUESTS");
  });
});

describe("클라이언트 IP", () => {
  it("RATE-9 TRUST_PROXY가 꺼져 있으면 X-Forwarded-For를 바꿔도 연결 주소로 센다", async () => {
    for (let i = 0; i <= LOGIN_LIMIT; i++) {
      const forged = t.client({
        kind: "native",
        ip: ATTACKER,
        headers: { "x-forwarded-for": `192.0.2.${i}` },
      });
      const result = await outcome(
        forged.auth.login({ email: "nobody@example.com", password: "wrong-password" }),
      );
      expect(result).toBe(i < LOGIN_LIMIT ? "INVALID_CREDENTIALS" : "TOO_MANY_REQUESTS");
    }
  });

  it("RATE-9 TRUST_PROXY가 켜져 있으면 X-Forwarded-For의 첫 주소로 센다", async () => {
    const proxied = createTestApp({ trustProxy: true });
    const PROXY = "10.0.0.1";
    const via = (forwardedFor: string, ip = PROXY) =>
      outcome(
        proxied
          .client({ kind: "native", ip, headers: { "x-forwarded-for": forwardedFor } })
          .auth.login({ email: "nobody@example.com", password: "wrong-password" }),
      );
    try {
      for (let i = 0; i < LOGIN_LIMIT; i++) await via(`${ATTACKER}, ${PROXY}`);
      expect(await via(`${ATTACKER}, ${PROXY}`)).toBe("TOO_MANY_REQUESTS");
      expect(await via("198.51.100.30")).toBe("INVALID_CREDENTIALS");
    } finally {
      await proxied.close();
    }
  });
});
