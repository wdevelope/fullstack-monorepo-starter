import { ORPCError } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import type { Contract, NotificationEvent } from "@starter/contracts";

export interface WatchNotificationsOptions {
  /** 이벤트마다 불린다. (다시) 연결할 때마다 `ready`가 오고, 그 뒤로 알림마다 온다. */
  onEvent(event: NotificationEvent): void;
  /** 중단하면 감시를 멈추고 열린 스트림을 닫는다. */
  signal: AbortSignal;
  /** 네트워크·서버 오류다. 헬퍼는 이 오류 뒤에 다시 시도한다. */
  onError?(error: unknown): void;
  /** `attempt`번째(1, 2, ...) 재시도 전 대기 시간이다. 기본값은 1초에서 두 배씩 늘어 30초까지 간다. */
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
 * 사용자가 로그인해 있는 동안 알림 스트림을 열어 둔다.
 *
 * - 서버는 액세스 토큰이 만료되면 스트림을 끝내고, 헬퍼는 곧바로 다시 연다. API 클라이언트는
 *   만료된 토큰의 UNAUTHORIZED를 보고 한 번 리프레시한 뒤 열기를 다시 시도한다.
 * - 네트워크·서버 오류에는 지수적으로 간격을 늘려 다시 시도하고, `ready`를 받으면 간격을 되돌린다.
 * - 리프레시한 뒤에도 UNAUTHORIZED가 나면 세션이 끝난 것이므로 헬퍼가 멈춘다.
 *
 * 멈추면 resolve된다. 다시 연결할 때마다 `ready`로 시작하므로, 이때 알림함을 다시 가져와
 * 끊긴 동안 온 것을 놓치지 않는다.
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
        // 읽기가 대기 중일 때 전송 계층이 중단을 알아챈다고 기대하지 않는다.
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
