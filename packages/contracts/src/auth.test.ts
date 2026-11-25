import { describe, expect, it } from "vitest";

import { authContract } from "./auth.ts";

const signupInput = authContract.signup["~orpc"].inputSchema!;

function parse(input: unknown) {
  return signupInput["~standard"].validate(input) as Awaited<
    ReturnType<(typeof signupInput)["~standard"]["validate"]>
  >;
}

describe("auth.signup 입력", () => {
  it("AUTH-3 이메일의 앞뒤 공백을 지우고 소문자로 바꾼다", () => {
    const result = parse({
      email: "  Alice@Example.COM ",
      password: "password1",
      nickname: "alice",
    });
    expect(result).toEqual({
      value: { email: "alice@example.com", password: "password1", nickname: "alice" },
    });
  });

  it.each([
    ["형식이 틀린 이메일은", { email: "not-an-email", password: "password1", nickname: "alice" }],
    ["8자 미만 비밀번호는", { email: "a@b.co", password: "short", nickname: "alice" }],
    ["한 글자 닉네임은", { email: "a@b.co", password: "password1", nickname: " a " }],
    ["21자 닉네임은", { email: "a@b.co", password: "password1", nickname: "x".repeat(21) }],
  ])("AUTH-3 %s 거부한다", (_, input) => {
    expect(parse(input)).toHaveProperty("issues");
  });
});

describe("요청 횟수 제한 오류", () => {
  it.each(["signup", "login", "refresh"] as const)(
    "RATE-2 auth.%s 계약에 TOO_MANY_REQUESTS(429)와 기다릴 초를 담은 오류가 있다",
    (procedure) => {
      const error = authContract[procedure]["~orpc"].errorMap.TOO_MANY_REQUESTS;
      expect(error?.status).toBe(429);
      const data = error?.data;
      expect(data?.["~standard"].validate({ retryAfterSeconds: 30 })).toEqual({
        value: { retryAfterSeconds: 30 },
      });
      expect(data?.["~standard"].validate({ retryAfterSeconds: 0 })).toHaveProperty("issues");
    },
  );
});
