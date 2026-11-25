import { describe, expect, it } from "vitest";

import { timeAgo } from "./time.ts";

describe("timeAgo", () => {
  const now = new Date("2026-11-05T12:00:00Z");

  it.each([
    [new Date("2026-11-05T11:59:30Z"), "방금"],
    [new Date("2026-11-05T12:00:20Z"), "방금"],
    [new Date("2026-11-05T11:55:00Z"), "5분 전"],
    [new Date("2026-11-05T09:00:00Z"), "3시간 전"],
    [new Date("2026-11-04T12:00:00Z"), "어제"],
    [new Date("2026-10-01T12:00:00Z"), "10월 1일"],
    [new Date("2025-11-05T12:00:00Z"), "2025년 11월 5일"],
  ])("PLAT-4 %s를 %s로 표시한다", (date, expected) => {
    expect(timeAgo(date, now)).toBe(expected);
  });
});
