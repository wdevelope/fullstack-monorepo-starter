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
  it("NOTI-1 행동한 사람과 글 제목만 보여 주고 댓글 내용은 보여 주지 않는다", () => {
    expect(notificationText({ ...base, type: "comment" })).toBe(
      "bob님이 “Launch plan” 글에 댓글을 달았어요",
    );
    expect(notificationText({ ...base, type: "like" })).toBe(
      "bob님이 “Launch plan” 글에 좋아요를 눌렀어요",
    );
  });
});
