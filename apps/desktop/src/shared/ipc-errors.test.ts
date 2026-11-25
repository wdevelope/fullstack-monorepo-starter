import { isDefinedError, ORPCError } from "@orpc/client";
import { describe, expect, it, vi } from "vitest";

import { deserializeError, serializeError, toIpcResult, unwrapIpcResult } from "./ipc-errors.ts";

describe("IPC 오류 전송 형식", () => {
  it("DESK-5 타입 있는 계약 오류를 code·status·message·data 그대로 다시 만든다", () => {
    const original = new ORPCError("ACCOUNT_LOCKED", {
      defined: true,
      status: 423,
      message: "로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.",
      data: { retryAfterSeconds: 900 },
    });

    // Electron IPC는 페이로드에 structuredClone을 적용한다.
    const rebuilt = deserializeError(structuredClone(serializeError(original)));

    expect(rebuilt).toBeInstanceOf(ORPCError);
    expect(isDefinedError(rebuilt)).toBe(true);
    expect(rebuilt).toMatchObject({
      code: "ACCOUNT_LOCKED",
      status: 423,
      message: "로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.",
      data: { retryAfterSeconds: 900 },
    });
  });

  it("DESK-6 오류의 cause와 stack은 렌더러로 보내지 않는다", () => {
    const original = new ORPCError("UNAUTHORIZED", { cause: new Error("secret detail") });

    const serialized = serializeError(original);

    expect(Object.keys(serialized).sort()).toEqual([
      "code",
      "data",
      "defined",
      "message",
      "status",
    ]);
    expect(JSON.stringify(serialized)).not.toContain("secret detail");
  });

  it("DESK-7 fetch 실패는 SERVICE_UNAVAILABLE로 보고한다", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(serializeError(new TypeError("fetch failed"))).toEqual({
      defined: false,
      code: "SERVICE_UNAVAILABLE",
      status: 503,
      message: "서버에 연결할 수 없어요. 네트워크 연결을 확인해 주세요.",
      data: undefined,
    });
  });

  it("DESK-6 예상하지 못한 오류의 메시지는 숨긴다", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(serializeError(new Error("token abc in a stack trace"))).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      status: 500,
      message: "문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
    });
  });

  it("DESK-6 깨진 페이로드는 믿지 않고 내부 오류로 바꾼다", () => {
    const rebuilt = deserializeError({ code: "NOT_FOUND", status: 200, extra: true });

    expect(rebuilt).toBeInstanceOf(ORPCError);
    expect(rebuilt.code).toBe("INTERNAL_SERVER_ERROR");
    expect(rebuilt.defined).toBe(false);
  });

  it("DESK-8 성공과 실패를 structured clone을 거쳐도 깨지지 않는 결과로 감싼다", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const success = await toIpcResult(async () => ({ createdAt }));
    const failure = await toIpcResult(async () => {
      throw new ORPCError("NOT_FOUND", {
        defined: true,
        status: 404,
        message: "요청한 내용을 찾을 수 없어요.",
      });
    });

    expect(unwrapIpcResult(structuredClone(success))).toEqual({ createdAt });
    expect(() => unwrapIpcResult(structuredClone(failure))).toThrow(
      expect.objectContaining({ code: "NOT_FOUND", status: 404, defined: true }),
    );
  });
});
