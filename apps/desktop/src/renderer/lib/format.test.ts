import { describe, expect, it } from "vitest";

import { timeAgo } from "./format.ts";

describe("timeAgo", () => {
  const now = new Date("2026-11-05T12:00:00Z");

  it.each([
    ["30초 전", "방금", new Date("2026-11-05T11:59:30Z")],
    ["기기보다 20초 앞선", "방금", new Date("2026-11-05T12:00:20Z")],
    ["5분 전", "5분 전", new Date("2026-11-05T11:55:00Z")],
    ["3시간 전", "3시간 전", new Date("2026-11-05T09:00:00Z")],
    ["하루 전", "어제", new Date("2026-11-04T12:00:00Z")],
    ["올해의 한 달 넘게 지난", "10월 1일", new Date("2026-10-01T12:00:00Z")],
    ["지난해", "2025년 11월 5일", new Date("2025-11-05T12:00:00Z")],
  ])('PLAT-4 %s 시각은 "%s"(으)로 보인다', (_label, expected, date) => {
    expect(timeAgo(date, now)).toBe(expected);
  });
});
