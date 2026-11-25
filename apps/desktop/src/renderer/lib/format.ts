const DAY = 24 * 3600;

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", DAY],
  ["hour", 3600],
  ["minute", 60],
];

const relative = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });
const dateFormat = new Intl.DateTimeFormat("ko", { month: "long", day: "numeric" });
const dateWithYearFormat = new Intl.DateTimeFormat("ko", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

/**
 * 글·댓글·알림의 시각(PLAT-4). "방금", "3분 전", "3시간 전", "어제". 그보다 오래되면 "11월 5일"이고,
 * 올해가 아니면 "2025년 11월 5일"이다. 기기보다 조금 앞선 서버 시각도 "방금"이다. 웹과 같은 규칙이다.
 */
export function timeAgo(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  if (seconds <= -2 * DAY) {
    const sameYear = date.getFullYear() === now.getFullYear();
    return (sameYear ? dateFormat : dateWithYearFormat).format(date);
  }
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.trunc(seconds / size), unit);
  }
  return "방금";
}
