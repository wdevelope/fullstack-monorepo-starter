import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { notificationText } from "../../../shared/notification-text.ts";
import { Button, ErrorNotice, Muted } from "../../components/ui.tsx";
import { errorMessage } from "../../lib/errors.ts";
import { formatDate } from "../../lib/format.ts";
import type { Navigate } from "../../lib/navigation.ts";
import { orpc } from "../../lib/orpc.ts";

/**
 * 메인이 알림 스트림에서 전달한 이벤트를 반영한다. 이벤트마다 읽지 않은 수가 실려 오고,
 * 목록은 다시 불러온다(다시 연결한 뒤 따라잡도록 `ready`에서도).
 */
export function useLiveNotifications() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      window.desktop.onNotification((event) => {
        queryClient.setQueryData(orpc.notifications.unreadCount.queryKey(), {
          count: event.unreadCount,
        });
        void queryClient.invalidateQueries({ queryKey: orpc.notifications.list.key() });
      }),
    [queryClient],
  );
}

export function NotificationButton({ navigate }: { navigate: Navigate }) {
  const unread = useQuery(orpc.notifications.unreadCount.queryOptions());
  const count = unread.data?.count ?? 0;
  return (
    <Button
      variant="ghost"
      aria-label={count > 0 ? `알림, 읽지 않음 ${count}개` : "알림"}
      onClick={() => navigate({ name: "notifications" })}
    >
      알림
      {count > 0 && (
        <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Button>
  );
}

export function NotificationsScreen({ navigate }: { navigate: Navigate }) {
  const queryClient = useQueryClient();
  const list = useQuery(orpc.notifications.list.queryOptions({ input: { limit: 50 } }));
  const markRead = useMutation(
    orpc.notifications.markRead.mutationOptions({
      onSuccess: ({ unreadCount }) => {
        queryClient.setQueryData(orpc.notifications.unreadCount.queryKey(), {
          count: unreadCount,
        });
        void queryClient.invalidateQueries({ queryKey: orpc.notifications.list.key() });
      },
    }),
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">알림</h1>
        <Button
          variant="secondary"
          disabled={markRead.isPending}
          onClick={() => markRead.mutate({})}
        >
          모두 읽음
        </Button>
      </div>
      {list.isPending && <Muted>불러오는 중…</Muted>}
      {list.isError && (
        <ErrorNotice message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      )}
      {list.data?.items.length === 0 && <Muted>아직 알림이 없어요.</Muted>}
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {list.data?.items.map((notification) => (
          <li key={notification.id}>
            <button
              type="button"
              className="flex w-full items-start gap-3 py-3 text-left"
              onClick={() => {
                if (!notification.readAt) markRead.mutate({ ids: [notification.id] });
                navigate({ name: "post", id: notification.post.id });
              }}
            >
              <span
                aria-hidden
                className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.readAt ? "bg-transparent" : "bg-blue-500"}`}
              />
              <span>
                <span className={notification.readAt ? "" : "font-medium"}>
                  {notificationText(notification)}
                </span>
                <span className="block text-xs text-zinc-500">
                  {formatDate(notification.createdAt)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
