import type { Notification } from "@starter/contracts";

/** 알림 하나에 한 줄: 누가 어느 글에 무엇을 했는지(댓글 내용은 절대 넣지 않는다). */
export function notificationText(notification: Notification): string {
  const verb = notification.type === "comment" ? "댓글을 달았어요" : "좋아요를 눌렀어요";
  return `${notification.actor.nickname}님이 “${notification.post.title}” 글에 ${verb}`;
}
