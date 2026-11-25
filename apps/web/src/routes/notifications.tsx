import { watchNotifications } from "@starter/api-client";
import type { Notification } from "@starter/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useState } from "react";

import { ErrorBanner } from "../components/ui.tsx";
import { client, orpc, queryClient } from "../lib/api.ts";
import { notificationPanelError, notificationText } from "../lib/notifications.ts";
import { timeAgo } from "../lib/time.ts";

const unreadQuery = () => orpc.notifications.unreadCount.queryOptions();

/**
 * 로그인한 동안 알림 스트림을 열어 둔다. 모든 이벤트에 읽지 않은 개수가 담겨 있어 요청 없이 배지를
 * 갱신한다. 목록은 다시 불러온다(끊긴 동안 놓친 알림을 따라잡도록 `ready`에서도).
 */
function useNotificationStream(userId: string, onNotification: (n: Notification) => void) {
  const notify = useEffectEvent(onNotification);

  useEffect(() => {
    const controller = new AbortController();
    void watchNotifications(client.api, {
      signal: controller.signal,
      onEvent(event) {
        queryClient.setQueryData(unreadQuery().queryKey, { count: event.unreadCount });
        void queryClient.invalidateQueries({ queryKey: orpc.notifications.list.key() });
        if (event.type === "notification") notify(event.notification);
      },
    });
    return () => controller.abort();
  }, [userId]);
}

export function NotificationBell({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notification | null>(null);

  useNotificationStream(userId, setToast);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5_000);
    return () => clearTimeout(timer);
  }, [toast]);

  const unread = useQuery(unreadQuery());
  const list = useQuery({
    ...orpc.notifications.list.queryOptions({ input: { limit: 20 } }),
    enabled: open,
  });
  const markRead = useMutation(
    orpc.notifications.markRead.mutationOptions({
      onSuccess: async ({ unreadCount }) => {
        queryClient.setQueryData(unreadQuery().queryKey, { count: unreadCount });
        await queryClient.invalidateQueries({ queryKey: orpc.notifications.list.key() });
      },
    }),
  );

  async function openNotification(notification: Notification) {
    setOpen(false);
    setToast(null);
    if (!notification.readAt) markRead.mutate({ ids: [notification.id] });
    await navigate({ to: "/posts/$postId", params: { postId: notification.post.id } });
  }

  const count = unread.data?.count ?? 0;
  const panelError = notificationPanelError(list.error, markRead.error);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={count > 0 ? `알림, 읽지 않음 ${count}개` : "알림"}
        className="relative rounded-lg px-2.5 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden>🔔</span>
        {count > 0 && (
          <span
            data-testid="unread-badge"
            className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-semibold leading-5 text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
            <span className="text-sm font-semibold">알림</span>
            <button
              type="button"
              className="text-xs text-indigo-600 hover:underline disabled:text-zinc-400 dark:text-indigo-400"
              disabled={count === 0 || markRead.isPending}
              onClick={() => markRead.mutate({})}
            >
              모두 읽음
            </button>
          </div>
          {panelError && (
            <div className="px-4 py-3">
              <ErrorBanner message={panelError} />
            </div>
          )}
          {list.isPending && <p className="px-4 py-3 text-sm text-zinc-500">불러오는 중…</p>}
          {list.data?.items.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">아직 알림이 없어요.</p>
          )}
          <ul className="max-h-96 overflow-y-auto">
            {list.data?.items.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-4 py-3 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  onClick={() => void openNotification(notification)}
                >
                  <span
                    aria-hidden
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.readAt ? "bg-transparent" : "bg-indigo-500"}`}
                  />
                  <span>
                    <span className={notification.readAt ? "" : "font-medium"}>
                      {notificationText(notification)}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {timeAgo(notification.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {toast && (
        <button
          type="button"
          role="status"
          className="fixed right-4 bottom-4 z-20 rounded-xl bg-zinc-900 px-4 py-3 text-left text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
          onClick={() => void openNotification(toast)}
        >
          {notificationText(toast)}
        </button>
      )}
    </div>
  );
}
