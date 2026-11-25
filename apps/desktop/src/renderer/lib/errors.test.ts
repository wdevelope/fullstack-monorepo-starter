import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { errorMessage } from "./errors.ts";

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
