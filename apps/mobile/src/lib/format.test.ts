import { describe, expect, it } from "vitest";

import { formatBadge, formatRelativeTime, formatWait, notificationText } from "./format";

describe("formatRelativeTime", () => {
  // UTC 정오로 두면 흔히 쓰는 모든 시간대에서 날짜가 같다.
  const now = new Date("2026-11-05T12:00:00Z");
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

  it("PLAT-4 최근 시각은 짧은 상대 시간으로 보인다", () => {
    expect(formatRelativeTime(ago(30), now)).toBe("방금");
    expect(formatRelativeTime(ago(5 * 60), now)).toBe("5분 전");
    expect(formatRelativeTime(ago(3 * 3600), now)).toBe("3시간 전");
    expect(formatRelativeTime(ago(86_400), now)).toBe("어제");
  });

  it("PLAT-4 이틀 이상 지난 시각은 날짜로 보이고, 연도는 올해가 아닐 때만 붙인다", () => {
    expect(formatRelativeTime(ago(2 * 86_400), now)).toBe("11월 3일");
    expect(formatRelativeTime(new Date("2026-03-05T12:00:00Z"), now)).toBe("3월 5일");
    expect(formatRelativeTime(new Date("2025-12-24T12:00:00Z"), now)).toBe("2025년 12월 24일");
  });

  it("PLAT-4 기기보다 조금 앞선 시각은 방금으로 본다", () => {
    expect(formatRelativeTime(ago(-20), now)).toBe("방금");
  });
});

describe("formatWait", () => {
  it("AUTH-6 대기 시간을 줄여 말하지 않도록 분 단위로 올림한다", () => {
    expect(formatWait(840)).toBe("14분");
    expect(formatWait(61)).toBe("2분");
    expect(formatWait(60)).toBe("1분");
  });

  it("AUTH-6 1분 미만은 초로 보인다", () => {
    expect(formatWait(1)).toBe("1초");
    expect(formatWait(45)).toBe("45초");
  });
});

describe("notifications", () => {
  const base = {
    id: "00000000-0000-4000-8000-0000000000aa",
    post: { id: "00000000-0000-4000-8000-0000000000bb", title: "출시 계획" },
    actor: { id: "00000000-0000-4000-8000-0000000000cc", nickname: "민준" },
    createdAt: new Date(0),
    readAt: null,
  };

  it("NOTI-1 행위자와 글은 밝히고 댓글 내용은 보이지 않는다", () => {
    expect(notificationText({ ...base, type: "comment" })).toBe(
      "민준님이 “출시 계획” 글에 댓글을 달았어요",
    );
    expect(notificationText({ ...base, type: "like" })).toBe(
      "민준님이 “출시 계획” 글에 좋아요를 눌렀어요",
    );
  });

  it("NOTI-5 읽지 않은 개수를 짧은 배지로 보이고, 0이면 아무것도 보이지 않는다", () => {
    expect(formatBadge(0)).toBeNull();
    expect(formatBadge(7)).toBe("7");
    expect(formatBadge(120)).toBe("99+");
  });
});
