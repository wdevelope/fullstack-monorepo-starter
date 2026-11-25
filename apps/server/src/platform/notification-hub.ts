import { Client } from "pg";
import * as z from "zod";

/** 모든 서버 인스턴스가 LISTEN하는 PostgreSQL 채널이다. 페이로드는 `{ id, recipientId }`다. */
export const NOTIFICATION_CHANNEL = "notifications";

const payloadSchema = z.object({ id: z.uuid(), recipientId: z.uuid() });

/** 읽지 않은 알림은 알림함에 남으므로, 느린 스트림은 가장 오래된 실시간 이벤트를 버려도 된다. */
const MAX_BUFFERED = 100;
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 30_000;

export interface NotificationHub {
  /** 이 인스턴스가 LISTEN을 시작하면 resolve된다. */
  ready(): Promise<void>;
  /**
   * 한 사용자의 알림 ID를 `signal`이 중단되거나 허브가 닫힐 때까지 내놓는다. 순회를 시작할 때가
   * 아니라 이 메서드를 부를 때 듣기 시작하므로, 부른 뒤에 보낸 것은 놓치지 않는다.
   */
  subscribe(userId: string, signal: AbortSignal): AsyncIterable<string>;
  close(): Promise<void>;
}

/**
 * 서버 인스턴스마다 전용 연결 하나가 채널을 LISTEN하고, 메시지마다 받는 사람의 프로세스 안
 * 구독자들에게 나눠 보낸다. 쓰는 쪽은 트랜잭션 안에서 NOTIFY를 보내고, PostgreSQL은 커밋한
 * 뒤에야 이를 모든 인스턴스에 전달한다.
 */
export function createNotificationHub(connectionString: string): NotificationHub {
  const subscribers = new Map<string, Set<(id: string) => void>>();
  const closing = new AbortController();
  let client: Client | null = null;
  let attempt = 0;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let markReady: () => void = () => {};
  const readyPromise = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  function dispatch(payload: string | undefined) {
    let parsed;
    try {
      parsed = payloadSchema.safeParse(JSON.parse(payload ?? ""));
    } catch {
      return;
    }
    if (!parsed.success) return;
    for (const listener of subscribers.get(parsed.data.recipientId) ?? []) listener(parsed.data.id);
  }

  function scheduleReconnect() {
    if (closing.signal.aborted || reconnectTimer) return;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attempt++);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, delay);
  }

  async function connect() {
    const next = new Client({ connectionString });
    client = next;
    // error 리스너가 없으면 연결이 끊길 때 프로세스가 죽는다.
    next.on("error", (error) => {
      console.error("알림 허브 연결 오류", error);
      void next.end().catch(() => {});
    });
    next.on("end", () => {
      if (client === next) client = null;
      scheduleReconnect();
    });
    next.on("notification", (message) => {
      if (message.channel === NOTIFICATION_CHANNEL) dispatch(message.payload);
    });
    try {
      await next.connect();
      await next.query(`LISTEN ${NOTIFICATION_CHANNEL}`);
      attempt = 0;
      markReady();
    } catch (error) {
      if (closing.signal.aborted) return;
      console.error("알림 허브가 LISTEN하지 못해 다시 시도한다", error);
      await next.end().catch(() => {});
    }
  }

  void connect();

  return {
    ready: () => readyPromise,

    subscribe(userId, signal) {
      const until = AbortSignal.any([signal, closing.signal]);
      const buffer: string[] = [];
      let wake: (() => void) | null = null;

      const listener = (id: string) => {
        buffer.push(id);
        if (buffer.length > MAX_BUFFERED) buffer.shift();
        wake?.();
      };
      const forUser = subscribers.get(userId) ?? new Set();
      forUser.add(listener);
      subscribers.set(userId, forUser);

      const stop = () => {
        forUser.delete(listener);
        if (forUser.size === 0 && subscribers.get(userId) === forUser) subscribers.delete(userId);
        wake?.();
      };
      if (until.aborted) stop();
      else until.addEventListener("abort", stop, { once: true });

      return {
        async *[Symbol.asyncIterator]() {
          try {
            while (!until.aborted) {
              const id = buffer.shift();
              if (id !== undefined) {
                yield id;
                continue;
              }
              await new Promise<void>((resolve) => {
                wake = resolve;
              });
              wake = null;
            }
          } finally {
            until.removeEventListener("abort", stop);
            stop();
          }
        },
      };
    },

    async close() {
      closing.abort();
      clearTimeout(reconnectTimer);
      subscribers.clear();
      await client?.end().catch(() => {});
    },
  };
}
