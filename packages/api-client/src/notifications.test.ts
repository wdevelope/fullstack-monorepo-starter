import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { contract, type NotificationEvent, type Session } from "@starter/contracts";
import { describe, expect, it } from "vitest";

import { createApiClient, watchNotifications, type RefreshTokenStore } from "./index.ts";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "a@example.com",
  nickname: "alice",
  createdAt: new Date(0),
};

const notification = {
  id: "00000000-0000-4000-8000-0000000000aa",
  type: "comment" as const,
  post: { id: "00000000-0000-4000-8000-0000000000bb", title: "Post" },
  actor: { id: "00000000-0000-4000-8000-0000000000cc", nickname: "bob" },
  createdAt: new Date(0),
  readAt: null,
};

/**
 * A fake server from the real contract. Only the latest access token works, like the real one.
 * Each open stream sends `ready`, then whatever `push` sends, until `endStreams` (token expiry).
 */
function createFakeServer() {
  const state = { access: 0, refresh: 0, refreshCalls: 0, streamOpens: 0, failNextFetches: 0 };
  const os = implement(contract).$context<{ headers: Headers }>();
  const open = new Set<{ push(event: NotificationEvent | null): void }>();

  const session = (): Session => ({
    user,
    accessToken: `access-${state.access}`,
    accessTokenExpiresAt: new Date(),
    refreshToken: `refresh-${state.refresh}`,
  });

  const router = os.router({
    auth: {
      signup: os.auth.signup.handler(() => session()),
      login: os.auth.login.handler(() => session()),
      refresh: os.auth.refresh.handler(({ input, errors }) => {
        state.refreshCalls++;
        if (input.refreshToken !== `refresh-${state.refresh}`) throw errors.INVALID_REFRESH_TOKEN();
        state.refresh++;
        state.access++;
        return session();
      }),
      logout: os.auth.logout.handler(() => ({})),
      me: os.auth.me.handler(() => user),
    },
    posts: {} as never,
    comments: {} as never,
    workspaces: {} as never,
    notifications: {
      list: os.notifications.list.handler(() => ({ items: [], nextCursor: null })),
      unreadCount: os.notifications.unreadCount.handler(() => ({ count: 0 })),
      markRead: os.notifications.markRead.handler(() => ({ unreadCount: 0 })),
      // Like the real server, the token is checked before the stream opens (a 401 response).
      stream: os.notifications.stream.handler(async ({ context }) => {
        if (context.headers.get("authorization") !== `Bearer access-${state.access}`) {
          throw new ORPCError("UNAUTHORIZED");
        }
        state.streamOpens++;
        const queue: (NotificationEvent | null)[] = [];
        let wake = () => {};
        const stream = {
          push(event: NotificationEvent | null) {
            queue.push(event);
            wake();
          },
        };
        open.add(stream);
        return (async function* () {
          try {
            yield { type: "ready" as const, unreadCount: 0 };
            while (true) {
              if (queue.length === 0) await new Promise<void>((resolve) => (wake = resolve));
              const next = queue.shift();
              if (next === null || next === undefined) return;
              yield next;
            }
          } finally {
            open.delete(stream);
          }
        })();
      }),
    },
  });

  const handler = new RPCHandler(router);
  async function fetch(input: RequestInfo | URL, init?: RequestInit) {
    if (state.failNextFetches > 0) {
      state.failNextFetches--;
      throw new TypeError("fetch failed");
    }
    const request = new Request(input, init);
    const { response } = await handler.handle(request, {
      prefix: "/rpc",
      context: { headers: request.headers },
    });
    return response ?? new Response("not found", { status: 404 });
  }

  return {
    state,
    fetch: fetch as typeof globalThis.fetch,
    push: (event: NotificationEvent) => open.forEach((stream) => stream.push(event)),
    /** The access token expires: open streams end and the token stops working. */
    expireAccessToken() {
      state.access++;
      open.forEach((stream) => stream.push(null));
    },
  };
}

function memoryStore(): RefreshTokenStore & { value: string | null } {
  return {
    value: null,
    async get() {
      return this.value;
    },
    async set(token) {
      this.value = token;
    },
  };
}

async function setUp() {
  const server = createFakeServer();
  const store = memoryStore();
  const client = createApiClient({
    url: "http://localhost/rpc",
    clientKind: "native",
    refreshTokenStore: store,
    fetch: server.fetch,
  });
  await client.signIn({ email: "a@example.com", password: "password1" });

  const events: NotificationEvent[] = [];
  const errors: unknown[] = [];
  const controller = new AbortController();
  const done = watchNotifications(client.api, {
    signal: controller.signal,
    onEvent: (event) => events.push(event),
    onError: (error) => errors.push(error),
    retryDelayMs: () => 5,
  });
  return { server, store, client, events, errors, controller, done };
}

async function until(condition: () => boolean) {
  for (let i = 0; i < 200 && !condition(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(condition()).toBe(true);
}

describe("watchNotifications", () => {
  it("NOTI-6 passes stream events to the handler until stopped", async () => {
    const { server, events, controller, done } = await setUp();
    await until(() => events.length === 1);

    server.push({ type: "notification", notification, unreadCount: 1 });
    await until(() => events.length === 2);
    expect(events).toEqual([
      { type: "ready", unreadCount: 0 },
      { type: "notification", notification, unreadCount: 1 },
    ]);

    controller.abort();
    await done;
  });

  it("NOTI-8 refreshes the token and reopens when the stream ends at expiry", async () => {
    const { server, store, events, controller, done } = await setUp();
    await until(() => events.length === 1);

    server.expireAccessToken();

    await until(() => events.length === 2);
    expect(events.map((e) => e.type)).toEqual(["ready", "ready"]);
    expect(server.state.refreshCalls).toBe(1);
    expect(server.state.streamOpens).toBe(2);
    expect(store.value).toBe("refresh-1");
    controller.abort();
    await done;
  });

  it("NOTI-8 backs off and retries after network errors", async () => {
    const { server, events, errors, controller, done } = await setUp();
    await until(() => events.length === 1);

    server.state.failNextFetches = 2;
    server.expireAccessToken();

    await until(() => events.length === 2);
    expect(errors).toHaveLength(2);
    controller.abort();
    await done;
  });

  it("NOTI-8 stops when the session can no longer be refreshed", async () => {
    const { server, store, client, events, done } = await setUp();
    await until(() => events.length === 1);

    await store.set("stolen-and-revoked");
    server.expireAccessToken();

    await done;
    expect(client.getUser()).toBeNull();
    expect(server.state.streamOpens).toBe(1);
  });
});
