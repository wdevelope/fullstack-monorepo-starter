import { describe, expect, it } from "vitest";

import { notificationText } from "./notifications.ts";

const base = {
  id: "00000000-0000-4000-8000-0000000000aa",
  post: { id: "00000000-0000-4000-8000-0000000000bb", title: "출시 계획" },
  actor: { id: "00000000-0000-4000-8000-0000000000cc", nickname: "bob" },
  createdAt: new Date(0),
  readAt: null,
};

describe("notificationText", () => {
  it("NOTI-1 댓글 알림에 행동한 사람과 글 제목을 담는다", () => {
    expect(notificationText({ ...base, type: "comment" })).toBe(
      "bob님이 “출시 계획” 글에 댓글을 달았어요",
    );
  });

  it("NOTI-3 좋아요 알림에 행동한 사람과 글 제목을 담는다", () => {
    expect(notificationText({ ...base, type: "like" })).toBe(
      "bob님이 “출시 계획” 글에 좋아요를 눌렀어요",
    );
  });
});
