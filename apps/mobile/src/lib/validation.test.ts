import { POST_BODY_MAX } from "@starter/contracts";
import { describe, expect, it } from "vitest";

import { validatePost, validateSignIn, validateSignUp } from "./validation";

describe("validateSignUp", () => {
  it("AUTH-3 잘못된 필드마다 계약의 제한값으로 이유를 설명한다", () => {
    expect(validateSignUp({ email: "not-an-email", password: "short", nickname: "a" })).toEqual({
      email: "올바른 이메일 주소를 입력해 주세요.",
      password: "8자 이상 입력해 주세요.",
      nickname: "2자 이상 입력해 주세요.",
    });
  });

  it("AUTH-3 서버처럼 앞뒤 공백을 지워, 공백이 붙은 입력은 통과하고 공백뿐인 입력은 막는다", () => {
    expect(
      validateSignUp({ email: "  Ann@Example.com ", password: "password1", nickname: " ann " }),
    ).toBeNull();
    expect(validateSignUp({ email: "a@b.co", password: "password1", nickname: "  a  " })).toEqual({
      nickname: "2자 이상 입력해 주세요.",
    });
  });
});

describe("validateSignIn", () => {
  it("AUTH-18 이메일과 비밀번호가 있어야 하지만 최소 길이는 보지 않는다", () => {
    expect(validateSignIn({ email: "", password: "" })).toEqual({
      email: "올바른 이메일 주소를 입력해 주세요.",
      password: "입력해 주세요.",
    });
    expect(validateSignIn({ email: "a@b.co", password: "x" })).toBeNull();
  });
});

describe("validatePost", () => {
  it("COM-5 빈 제목과 제한을 넘는 본문을 거절한다", () => {
    expect(validatePost({ title: "   ", body: "x".repeat(POST_BODY_MAX + 1) })).toEqual({
      title: "입력해 주세요.",
      body: "10,000자 이하로 입력해 주세요.",
    });
  });

  it("COM-5 앞뒤 공백을 지운 제목과 본문을 받아들인다", () => {
    expect(validatePost({ title: " Hello ", body: " World " })).toBeNull();
  });
});
