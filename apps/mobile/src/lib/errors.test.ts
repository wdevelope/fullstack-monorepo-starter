import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { errorMessage, shouldRetry } from "./errors";

describe("errorMessage", () => {
  it("AUTH-5 이메일과 비밀번호 중 어느 쪽이 틀렸는지 밝히지 않는다", () => {
    const error = new ORPCError("INVALID_CREDENTIALS", { status: 401, defined: true });

    expect(errorMessage(error)).toBe("이메일 또는 비밀번호가 맞지 않아요.");
  });

  it("AUTH-6 잠긴 사용자에게 얼마나 기다려야 하는지 알려 준다", () => {
    const error = new ORPCError("ACCOUNT_LOCKED", {
      status: 423,
      defined: true,
      data: { retryAfterSeconds: 840 },
    });

    expect(errorMessage(error)).toBe("로그인 시도가 너무 많아요. 14분 뒤에 다시 시도해 주세요.");
  });

  it("AUTH-6 대기 시간이 없어도 잠금을 설명한다", () => {
    const error = new ORPCError("ACCOUNT_LOCKED", { status: 423 });

    expect(errorMessage(error)).toBe("로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.");
  });

  it("AUTH-2 이미 가입한 이메일이면 로그인으로 안내한다", () => {
    const error = new ORPCError("EMAIL_TAKEN", { status: 409, defined: true });

    expect(errorMessage(error)).toBe("이미 가입한 이메일이에요. 로그인해 주세요.");
  });

  it("AUTH-3 서버가 거절한 입력을 설명한다", () => {
    const error = new ORPCError("BAD_REQUEST", { message: "Input validation failed" });

    expect(errorMessage(error)).toBe("입력한 내용을 다시 확인해 주세요.");
  });

  it("AUTH-12 세션이 끝나면 다시 로그인하라고 한다", () => {
    expect(errorMessage(new ORPCError("UNAUTHORIZED"))).toBe("로그인이 필요해요.");
    expect(errorMessage(new ORPCError("INVALID_REFRESH_TOKEN", { status: 401 }))).toBe(
      "로그인이 필요해요.",
    );
  });

  it("COM-4 글이나 댓글이 없으면 삭제됐을 수 있다고 말한다", () => {
    expect(errorMessage(new ORPCError("NOT_FOUND", { defined: true }))).toBe(
      "찾을 수 없어요. 삭제되었을 수 있어요.",
    );
  });

  it("COM-6 작성자만 글을 바꿀 수 있다고 말한다", () => {
    expect(errorMessage(new ORPCError("FORBIDDEN", { defined: true }))).toBe(
      "작성자만 할 수 있어요.",
    );
  });

  it("PLAT-2 서버 내부 사정을 일반 문구 뒤에 숨긴다", () => {
    const error = new ORPCError("INTERNAL_SERVER_ERROR", { message: "relation does not exist" });

    expect(errorMessage(error)).toBe("문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
  });

  it("PLAT-1 fetch 실패를 연결 문제로 본다", () => {
    const offline = "서버에 연결할 수 없어요. 네트워크 연결을 확인해 주세요.";

    // React Native 자체 fetch와, Expo가 전역 fetch로 설치하는 expo/fetch.
    expect(errorMessage(new TypeError("Network request failed"))).toBe(offline);
    expect(errorMessage(new Error("fetch failed: The Internet connection is offline."))).toBe(
      offline,
    );
  });

  it("PLAT-2 그 밖의 것은 일반 문구로 대신한다", () => {
    expect(errorMessage("boom")).toBe("문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
  });
});

describe("shouldRetry", () => {
  it("PLAT-3 서버가 의도해서 돌려준 응답은 재시도하지 않는다", () => {
    expect(shouldRetry(0, new ORPCError("NOT_FOUND"))).toBe(false);
    expect(shouldRetry(0, new ORPCError("UNAUTHORIZED"))).toBe(false);
  });

  it("PLAT-3 네트워크·서버 오류는 두 번까지 재시도한다", () => {
    const error = new TypeError("Network request failed");

    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, new ORPCError("INTERNAL_SERVER_ERROR"))).toBe(true);
    expect(shouldRetry(2, error)).toBe(false);
  });
});

describe("요청 횟수 제한", () => {
  it.each([
    [30, "요청이 너무 많아요. 30초 뒤에 다시 시도해 주세요."],
    [90, "요청이 너무 많아요. 2분 뒤에 다시 시도해 주세요."],
    [3600, "요청이 너무 많아요. 60분 뒤에 다시 시도해 주세요."],
  ])("RATE-10 %i초를 기다려야 하면 기다릴 시간과 함께 알린다", (seconds, expected) => {
    const error = new ORPCError("TOO_MANY_REQUESTS", { data: { retryAfterSeconds: seconds } });
    expect(errorMessage(error)).toBe(expected);
  });
});
