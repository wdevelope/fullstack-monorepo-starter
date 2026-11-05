import { isDefinedError, ORPCError } from "@orpc/client";
import { describe, expect, it, vi } from "vitest";

import { deserializeError, serializeError, toIpcResult, unwrapIpcResult } from "./ipc-errors.ts";

describe("IPC error wire format", () => {
  it("rebuilds a typed contract error with its code, status, message and data", () => {
    const original = new ORPCError("ACCOUNT_LOCKED", {
      defined: true,
      status: 423,
      message: "Too many failed attempts. Try again later.",
      data: { retryAfterSeconds: 900 },
    });

    // structuredClone is what Electron IPC does to the payload.
    const rebuilt = deserializeError(structuredClone(serializeError(original)));

    expect(rebuilt).toBeInstanceOf(ORPCError);
    expect(isDefinedError(rebuilt)).toBe(true);
    expect(rebuilt).toMatchObject({
      code: "ACCOUNT_LOCKED",
      status: 423,
      message: "Too many failed attempts. Try again later.",
      data: { retryAfterSeconds: 900 },
    });
  });

  it("does not send the cause or stack of an error to the renderer", () => {
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

  it("reports a failed fetch as SERVICE_UNAVAILABLE", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(serializeError(new TypeError("fetch failed"))).toEqual({
      defined: false,
      code: "SERVICE_UNAVAILABLE",
      status: 503,
      message: "Could not reach the server.",
      data: undefined,
    });
  });

  it("hides the message of unexpected errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(serializeError(new Error("token abc in a stack trace"))).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      status: 500,
      message: "Something went wrong.",
    });
  });

  it("turns a malformed payload into an internal error instead of trusting it", () => {
    const rebuilt = deserializeError({ code: "NOT_FOUND", status: 200, extra: true });

    expect(rebuilt).toBeInstanceOf(ORPCError);
    expect(rebuilt.code).toBe("INTERNAL_SERVER_ERROR");
    expect(rebuilt.defined).toBe(false);
  });

  it("wraps success and failure in a result that survives structured cloning", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const success = await toIpcResult(async () => ({ createdAt }));
    const failure = await toIpcResult(async () => {
      throw new ORPCError("NOT_FOUND", { defined: true, status: 404, message: "Not found." });
    });

    expect(unwrapIpcResult(structuredClone(success))).toEqual({ createdAt });
    expect(() => unwrapIpcResult(structuredClone(failure))).toThrow(
      expect.objectContaining({ code: "NOT_FOUND", status: 404, defined: true }),
    );
  });
});
