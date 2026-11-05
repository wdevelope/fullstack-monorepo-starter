import { Client } from "pg";
import * as z from "zod";

/** The PostgreSQL channel every server instance LISTENs on. Payload: `{ id, recipientId }`. */
export const NOTIFICATION_CHANNEL = "notifications";

const payloadSchema = z.object({ id: z.uuid(), recipientId: z.uuid() });

/** Unread notifications stay in the inbox, so a slow stream may drop the oldest live events. */
const MAX_BUFFERED = 100;
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 30_000;

export interface NotificationHub {
  /** Resolves once this instance is LISTENing. */
  ready(): Promise<void>;
  /**
   * Notification IDs for one user, until `signal` aborts or the hub closes. Listening starts when
   * this is called, not when iteration starts, so nothing sent after the call is missed.
   */
  subscribe(userId: string, signal: AbortSignal): AsyncIterable<string>;
  close(): Promise<void>;
}

/**
 * One dedicated connection per server instance LISTENs on the channel and fans each message out to
 * the in-process subscribers of its recipient. Writers send NOTIFY inside their transaction, which
 * PostgreSQL delivers only after commit, to every instance.
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
    // Without an error listener a dropped connection would crash the process.
    next.on("error", (error) => {
      console.error("Notification hub connection error", error);
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
      console.error("Notification hub could not LISTEN; retrying", error);
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
