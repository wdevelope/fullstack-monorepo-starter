import type { Notification } from "@starter/contracts";

/** 알림 하나를 한 줄로 만든다. 누가 어느 글에 무엇을 했는지만 담고 댓글 내용은 담지 않는다. */
export function notificationText(notification: Notification): string {
  const verb = notification.type === "comment" ? "댓글을 달았어요" : "좋아요를 눌렀어요";
  return `${notification.actor.nickname}님이 “${notification.post.title}” 글에 ${verb}`;
}
