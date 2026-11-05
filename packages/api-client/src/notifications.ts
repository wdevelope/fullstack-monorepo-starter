import { ORPCError } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import type { Contract, NotificationEvent } from "@starter/contracts";

export interface WatchNotificationsOptions {
  /** Called for every event: `ready` on each (re)connect, then each notification. */
  onEvent(event: NotificationEvent): void;
  /** Aborting stops watching and closes the open stream. */
  signal: AbortSignal;
  /** Network and server errors; the helper retries after them. */
  onError?(error: unknown): void;
  /** Delay before retry number `attempt` (1, 2, ...). Defaults to 1s doubling up to 30s. */
  retryDelayMs?(attempt: number): number;
}

const defaultRetryDelay = (attempt: number) => Math.min(30_000, 1_000 * 2 ** (attempt - 1));

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

/**
 * Keeps the notification stream open for as long as the user is signed in.
 *
 * - The server ends the stream when the access token expires; the helper reopens it at once. The
 *   api client sees the expired token's UNAUTHORIZED, refreshes once and retries the open.
 * - Network and server errors back off exponentially, reset after a successful `ready`.
 * - UNAUTHORIZED that survives the refresh means the session is over, so the helper stops.
 *
 * Resolves when stopped. Every reconnect starts with `ready`, so refetch the inbox on it to catch
 * anything sent while disconnected.
 */
export async function watchNotifications(
  api: ContractRouterClient<Contract>,
  options: WatchNotificationsOptions,
): Promise<void> {
  const { signal, onEvent, onError } = options;
  const retryDelay = options.retryDelayMs ?? defaultRetryDelay;
  let failures = 0;

  const aborted = new Promise<"aborted">((resolve) => {
    if (signal.aborted) resolve("aborted");
    signal.addEventListener("abort", () => resolve("aborted"), { once: true });
  });

  while (!signal.aborted) {
    try {
      const events = await api.notifications.stream(undefined, { signal });
      while (true) {
        // Do not depend on the transport noticing the abort while a read is pending.
        const next = await Promise.race([events.next(), aborted]);
        if (next === "aborted") {
          void events.return?.(undefined).catch(() => {});
          return;
        }
        if (next.done) break;
        if (next.value.type === "ready") failures = 0;
        onEvent(next.value);
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ORPCError && error.code === "UNAUTHORIZED") return;
      onError?.(error);
      failures++;
    }
    if (failures > 0) await sleep(retryDelay(failures), signal);
  }
}
