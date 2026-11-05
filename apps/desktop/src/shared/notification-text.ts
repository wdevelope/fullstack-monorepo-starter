import type { Notification } from "@starter/contracts";

/** One line per notification: who did what on which post (never the comment text). */
export function notificationText(notification: Notification): string {
  const verb = notification.type === "comment" ? "commented on" : "liked";
  return `${notification.actor.nickname} ${verb} “${notification.post.title}”`;
}
