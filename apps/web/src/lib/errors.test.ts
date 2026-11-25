import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { describeError, safeRedirect } from "./errors.ts";

describe("describeError", () => {
  it("AUTH-6 잠긴 사용자에게 몇 분 기다려야 하는지 알려 준다", () => {
    const error = new ORPCError("ACCOUNT_LOCKED", { data: { retryAfterSeconds: 840 } });
    expect(describeError(error)).toBe("로그인 시도가 너무 많아요. 14분 뒤에 다시 시도해 주세요.");
  });

  it("AUTH-5 틀린 로그인 정보에는 서버 메시지를 보인다", () => {
    const error = new ORPCError("INVALID_CREDENTIALS", {
      message: "이메일 또는 비밀번호가 올바르지 않아요.",
    });
    expect(describeError(error)).toBe("이메일 또는 비밀번호가 올바르지 않아요.");
  });

  it("WS-3 없는 이메일과 이미 멤버인 사람에는 서버 메시지를 보인다", () => {
    for (const [code, message] of [
      ["USER_NOT_FOUND", "이 이메일을 쓰는 계정이 없어요."],
      ["ALREADY_MEMBER", "이미 멤버예요."],
    ]) {
      expect(describeError(new ORPCError(code!, { message }))).toBe(message);
    }
  });

  it("PLAT-1 API 오류가 아닌 실패는 연결 문제로 보인다", () => {
    expect(describeError(new TypeError("Failed to fetch"))).toBe(
      "서버에 연결할 수 없어요. 네트워크 연결을 확인해 주세요.",
    );
  });

  it("PLAT-2 예상하지 못한 서버 오류는 메시지를 숨기고 일반 오류 문구를 보인다", () => {
    const error = new ORPCError("INTERNAL_SERVER_ERROR", { message: "relation does not exist" });
    expect(describeError(error)).toBe("문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
  });
});

describe("safeRedirect", () => {
  it.each([
    ["/posts/new", "/posts/new"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    [undefined, "/"],
  ])("AUTH-20 %s를 %s로 바꾼다", (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});

describe("요청 횟수 제한", () => {
  it.each([
    [30, "요청이 너무 많아요. 30초 뒤에 다시 시도해 주세요."],
    [90, "요청이 너무 많아요. 2분 뒤에 다시 시도해 주세요."],
    [3600, "요청이 너무 많아요. 60분 뒤에 다시 시도해 주세요."],
  ])("RATE-10 %i초를 기다려야 하면 기다릴 시간과 함께 알린다", (seconds, expected) => {
    const error = new ORPCError("TOO_MANY_REQUESTS", { data: { retryAfterSeconds: seconds } });
    expect(describeError(error)).toBe(expected);
  });
});
