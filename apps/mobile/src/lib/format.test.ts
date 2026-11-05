import { describe, expect, it } from "vitest";

import { formatBadge, formatRelativeTime, formatWait, notificationText, pluralize } from "./format";

describe("formatRelativeTime", () => {
  // Noon UTC keeps the calendar day the same in every common time zone.
  const now = new Date("2026-11-05T12:00:00Z");
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

  it("shows recent moments in short units", () => {
    expect(formatRelativeTime(ago(30), now)).toBe("just now");
    expect(formatRelativeTime(ago(5 * 60), now)).toBe("5m");
    expect(formatRelativeTime(ago(3 * 3600), now)).toBe("3h");
    expect(formatRelativeTime(ago(6 * 86_400), now)).toBe("6d");
  });

  it("shows older dates as a calendar date, with the year only when it differs", () => {
    expect(formatRelativeTime(new Date("2026-03-05T12:00:00Z"), now)).toBe("Mar 5");
    expect(formatRelativeTime(new Date("2025-12-24T12:00:00Z"), now)).toBe("Dec 24, 2025");
  });

  it("treats a clock slightly ahead of the device as just now", () => {
    expect(formatRelativeTime(ago(-20), now)).toBe("just now");
  });
});

describe("formatWait", () => {
  it("rounds up to whole minutes so the wait is never understated", () => {
    expect(formatWait(840)).toBe("14 minutes");
    expect(formatWait(61)).toBe("2 minutes");
    expect(formatWait(60)).toBe("1 minute");
  });

  it("uses seconds under a minute", () => {
    expect(formatWait(1)).toBe("1 second");
    expect(formatWait(45)).toBe("45 seconds");
  });
});

describe("pluralize", () => {
  it("adds an s for every count but one", () => {
    expect(pluralize(0, "like")).toBe("0 likes");
    expect(pluralize(1, "comment")).toBe("1 comment");
    expect(pluralize(12, "comment")).toBe("12 comments");
  });
});

describe("notifications", () => {
  const base = {
    id: "00000000-0000-4000-8000-0000000000aa",
    post: { id: "00000000-0000-4000-8000-0000000000bb", title: "Launch plan" },
    actor: { id: "00000000-0000-4000-8000-0000000000cc", nickname: "bob" },
    createdAt: new Date(0),
    readAt: null,
  };

  it("NOTI-1 names the actor and the post, never the comment", () => {
    expect(notificationText({ ...base, type: "comment" })).toBe("bob commented on “Launch plan”");
    expect(notificationText({ ...base, type: "like" })).toBe("bob liked “Launch plan”");
  });

  it("NOTI-5 shows the unread count as a short badge, or nothing at zero", () => {
    expect(formatBadge(0)).toBeNull();
    expect(formatBadge(7)).toBe("7");
    expect(formatBadge(120)).toBe("99+");
  });
});
