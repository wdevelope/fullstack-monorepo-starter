import { describe, expect, it } from "vitest";

import { timeAgo } from "./time.ts";

describe("timeAgo", () => {
  const now = new Date("2026-11-05T12:00:00Z");

  it.each([
    [new Date("2026-11-05T11:59:30Z"), "just now"],
    [new Date("2026-11-05T11:55:00Z"), "5 minutes ago"],
    [new Date("2026-11-05T09:00:00Z"), "3 hours ago"],
    [new Date("2026-11-04T12:00:00Z"), "yesterday"],
  ])("formats %s as %s", (date, expected) => {
    expect(timeAgo(date, now)).toBe(expected);
  });
});
