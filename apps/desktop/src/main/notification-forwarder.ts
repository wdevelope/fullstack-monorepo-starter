import type { ApiClient, watchNotifications } from "@starter/api-client";
import type { Notification, NotificationEvent } from "@starter/contracts";

export interface NotificationForwarderOptions {
  client: Pick<ApiClient, "api" | "getUser" | "subscribe">;
  watch: typeof watchNotifications;
  /** Sends the event to the renderer over the notification IPC channel. */
  send(event: NotificationEvent): void;
  /** Shows a system notification. */
  show(notification: Notification): void;
}

/**
 * Main owns the notification stream, as it owns every network call: it keeps one stream open while
 * a user is signed in, restarts it when the user changes, and forwards each event. Free of
 * Electron so it can be tested. Returns a function that stops it.
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
