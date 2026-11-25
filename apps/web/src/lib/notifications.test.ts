import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { notificationPanelError, notificationText } from "./notifications.ts";

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

describe("notificationPanelError", () => {
  const offline = new TypeError("Failed to fetch");

  it("NOTI-10 읽음 처리가 실패하면 무엇이 실패했는지와 이유를 알린다", () => {
    expect(notificationPanelError(null, offline)).toBe(
      "읽음으로 표시하지 못했어요. 서버에 연결할 수 없어요. 네트워크 연결을 확인해 주세요.",
    );
  });

  it("NOTI-10 목록을 불러오지 못하면 빈 창 대신 실패를 알린다", () => {
    expect(notificationPanelError(new ORPCError("UNAUTHORIZED"), null)).toBe(
      "알림을 불러오지 못했어요. 로그인이 필요해요.",
    );
  });

  it("NOTI-10 실패가 없으면 아무것도 보이지 않는다", () => {
    expect(notificationPanelError(null, null)).toBeNull();
  });
});
