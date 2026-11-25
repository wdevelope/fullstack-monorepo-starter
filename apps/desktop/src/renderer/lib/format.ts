const dateTime = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });

export function formatDate(date: Date) {
  return dateTime.format(date);
}
