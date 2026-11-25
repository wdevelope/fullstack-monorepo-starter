import type { Notification } from "@starter/contracts";

import { describeError } from "./errors.ts";

/** 알림 하나를 한 줄로 만든다. 누가 어느 글에 무엇을 했는지만 담고 댓글 내용은 담지 않는다. */
export function notificationText(notification: Notification): string {
  const verb = notification.type === "comment" ? "댓글을 달았어요" : "좋아요를 눌렀어요";
  return `${notification.actor.nickname}님이 “${notification.post.title}” 글에 ${verb}`;
}

/**
 * 알림 창에 보일 실패 문구. 읽음 처리나 목록 조회가 실패하면 빈 창이나 무반응으로 넘기지 않고
 * 무엇이 왜 실패했는지 알린다(NOTI-10). 오류 값은 TanStack Query의 `error`(없으면 null)다.
 */
export function notificationPanelError(listError: unknown, markReadError: unknown): string | null {
  if (markReadError != null) return `읽음으로 표시하지 못했어요. ${describeError(markReadError)}`;
  if (listError != null) return `알림을 불러오지 못했어요. ${describeError(listError)}`;
  return null;
}
