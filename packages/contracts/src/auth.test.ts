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
