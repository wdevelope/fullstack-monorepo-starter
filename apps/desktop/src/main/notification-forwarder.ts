import type { ApiClient, watchNotifications } from "@starter/api-client";
import type { Notification, NotificationEvent } from "@starter/contracts";

export interface NotificationForwarderOptions {
  client: Pick<ApiClient, "api" | "getUser" | "subscribe">;
  watch: typeof watchNotifications;
  /** 알림 IPC 채널로 렌더러에 이벤트를 보낸다. */
  send(event: NotificationEvent): void;
  /** 시스템 알림을 띄운다. */
  show(notification: Notification): void;
}

/**
 * 모든 네트워크 호출처럼 알림 스트림도 메인이 갖는다. 사용자가 로그인한 동안 스트림 하나를 열어 두고,
 * 사용자가 바뀌면 다시 시작하며, 이벤트를 하나씩 전달한다. 테스트할 수 있도록 Electron에 의존하지
 * 않는다. 멈추는 함수를 돌려준다.
 */
export function startNotificationForwarder(options: NotificationForwarderOptions): () => void {
  const { client, watch, send, show } = options;
  let current: { userId: string; controller: AbortController } | null = null;

  function sync() {
    const userId = client.getUser()?.id ?? null;
    if (current?.userId === userId) return;
    current?.controller.abort();
    current = null;
    if (!userId) return;

    const controller = new AbortController();
    current = { userId, controller };
    void watch(client.api, {
      signal: controller.signal,
      onEvent(event) {
        send(event);
        if (event.type === "notification") show(event.notification);
      },
      onError: (error) => console.warn("Notification stream error; retrying", error),
    });
  }

  const unsubscribe = client.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    current?.controller.abort();
    current = null;
  };
}
