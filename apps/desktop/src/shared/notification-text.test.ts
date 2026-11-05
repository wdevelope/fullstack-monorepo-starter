import { describe, expect, it } from "vitest";

import { notificationText } from "./notification-text.ts";

const base = {
  id: "00000000-0000-4000-8000-0000000000aa",
  post: { id: "00000000-0000-4000-8000-0000000000bb", title: "Launch plan" },
  actor: { id: "00000000-0000-4000-8000-0000000000cc", nickname: "bob" },
  createdAt: new Date(0),
  readAt: null,
};

describe("notificationText", () => {
  it("NOTI-1 names the actor and the post, never the comment", () => {
    expect(notificationText({ ...base, type: "comment" })).toBe("bob commented on “Launch plan”");
    expect(notificationText({ ...base, type: "like" })).toBe("bob liked “Launch plan”");
  });
});
