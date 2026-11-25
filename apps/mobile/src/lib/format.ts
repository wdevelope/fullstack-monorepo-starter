import type { Notification, WorkspaceRole } from "@starter/contracts";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 목록 행에 쓰는 짧은 경과 시간: "방금", "5분 전", "3시간 전", "어제", 그 뒤로는 날짜. */
export function formatRelativeTime(date: Date, now = new Date()): string {
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < MINUTE) return "방금";
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}분 전`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}시간 전`;
  if (seconds < 2 * DAY) return "어제";
  return date.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() && { year: "numeric" }),
  });
}

/** 잠긴 계정이 기다려야 하는 시간. 예: "14분". */
export function formatWait(totalSeconds: number): string {
  if (totalSeconds < MINUTE) return `${totalSeconds}초`;
  return `${Math.ceil(totalSeconds / MINUTE)}분`;
}

/** 알림 한 줄: 누가 어느 글에 무엇을 했는지(댓글 내용은 넣지 않는다). */
export function notificationText(notification: Notification): string {
  const { nickname } = notification.actor;
  const title = notification.post.title;
  return notification.type === "comment"
    ? `${nickname}님이 “${title}” 글에 댓글을 달았어요`
    : `${nickname}님이 “${title}” 글에 좋아요를 눌렀어요`;
}

/** 읽지 않음 배지: 0이면 보이지 않고, "99+"보다 길어지지 않는다. */
export function formatBadge(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

/** 워크스페이스 역할을 화면에 보일 이름. */
export const roleLabel: Record<WorkspaceRole, string> = {
  owner: "소유자",
  admin: "관리자",
  member: "멤버",
};
