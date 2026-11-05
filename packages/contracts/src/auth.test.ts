import { describe, expect, it } from "vitest";

import { authContract } from "./auth.ts";

const signupInput = authContract.signup["~orpc"].inputSchema!;

function parse(input: unknown) {
  return signupInput["~standard"].validate(input) as Awaited<
    ReturnType<(typeof signupInput)["~standard"]["validate"]>
  >;
}

describe("auth.signup input", () => {
  it("AUTH-3 trims and lowercases the email", () => {
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
    ["an invalid email", { email: "not-an-email", password: "password1", nickname: "alice" }],
    ["a password under 8 characters", { email: "a@b.co", password: "short", nickname: "alice" }],
    ["a one-character nickname", { email: "a@b.co", password: "password1", nickname: " a " }],
    [
      "a 21-character nickname",
      { email: "a@b.co", password: "password1", nickname: "x".repeat(21) },
    ],
  ])("AUTH-3 rejects %s", (_, input) => {
    expect(parse(input)).toHaveProperty("issues");
  });
});
