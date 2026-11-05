import type { Notification } from "@starter/contracts";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Compact age for list rows: "just now", "5m", "3h", "6d", then a calendar date. */
export function formatRelativeTime(date: Date, now = new Date()): string {
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < MINUTE) return "just now";
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h`;
  if (seconds < WEEK) return `${Math.floor(seconds / DAY)}d`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() && { year: "numeric" }),
  });
}

/** How long a locked account must wait, e.g. "14 minutes". */
export function formatWait(totalSeconds: number): string {
  if (totalSeconds < MINUTE) return pluralize(totalSeconds, "second");
  return pluralize(Math.ceil(totalSeconds / MINUTE), "minute");
}

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** One line per notification: who did what on which post (never the comment text). */
export function notificationText(notification: Notification): string {
  const verb = notification.type === "comment" ? "commented on" : "liked";
  return `${notification.actor.nickname} ${verb} “${notification.post.title}”`;
}

/** The unread badge: nothing at zero, and never wider than "99+". */
export function formatBadge(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}
