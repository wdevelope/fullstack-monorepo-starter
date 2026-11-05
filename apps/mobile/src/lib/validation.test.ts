import { POST_BODY_MAX } from "@starter/contracts";
import { describe, expect, it } from "vitest";

import { validatePost, validateSignIn, validateSignUp } from "./validation";

describe("validateSignUp", () => {
  it("AUTH-3 explains each invalid field with the contract's limits", () => {
    expect(validateSignUp({ email: "not-an-email", password: "short", nickname: "a" })).toEqual({
      email: "Enter a valid email address.",
      password: "Use at least 8 characters.",
      nickname: "Use at least 2 characters.",
    });
  });

  it("AUTH-3 trims like the server, so padded input passes and blank padding does not", () => {
    expect(
      validateSignUp({ email: "  Ann@Example.com ", password: "password1", nickname: " ann " }),
    ).toBeNull();
    expect(validateSignUp({ email: "a@b.co", password: "password1", nickname: "  a  " })).toEqual({
      nickname: "Use at least 2 characters.",
    });
  });
});

describe("validateSignIn", () => {
  it("requires an email and a password but no minimum length", () => {
    expect(validateSignIn({ email: "", password: "" })).toEqual({
      email: "Enter a valid email address.",
      password: "Required.",
    });
    expect(validateSignIn({ email: "a@b.co", password: "x" })).toBeNull();
  });
});

describe("validatePost", () => {
  it("COM-5 rejects a blank title and a body over the limit", () => {
    expect(validatePost({ title: "   ", body: "x".repeat(POST_BODY_MAX + 1) })).toEqual({
      title: "Required.",
      body: "Use at most 10,000 characters.",
    });
  });

  it("COM-5 accepts a trimmed title and body", () => {
    expect(validatePost({ title: " Hello ", body: " World " })).toBeNull();
  });
});
