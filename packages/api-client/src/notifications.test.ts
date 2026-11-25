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
 * 실제 계약으로 만든 가짜 서버다. 실제 서버처럼 가장 최근 액세스 토큰만 통한다.
 * 열린 스트림은 저마다 `ready`를 보내고, `endStreams`(토큰 만료) 전까지 `push`가 보내는 것을 보낸다.
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
      // 실제 서버처럼 스트림을 열기 전에 토큰을 확인한다(401 응답).
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
    /** 액세스 토큰이 만료된다. 열린 스트림이 끝나고 토큰을 더 쓸 수 없다. */
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
  it("NOTI-6 멈출 때까지 스트림 이벤트를 핸들러에 넘긴다", async () => {
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

  it("NOTI-8 토큰 만료로 스트림이 끝나면 토큰을 리프레시하고 다시 연다", async () => {
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

  it("NOTI-8 네트워크 오류 뒤에는 간격을 늘려 가며 다시 시도한다", async () => {
    const { server, events, errors, controller, done } = await setUp();
    await until(() => events.length === 1);

    server.state.failNextFetches = 2;
    server.expireAccessToken();

    await until(() => events.length === 2);
    expect(errors).toHaveLength(2);
    controller.abort();
    await done;
  });

  it("NOTI-8 세션을 더는 리프레시할 수 없으면 멈춘다", async () => {
    const { server, store, client, events, done } = await setUp();
    await until(() => events.length === 1);

    await store.set("stolen-and-revoked");
    server.expireAccessToken();

    await done;
    expect(client.getUser()).toBeNull();
    expect(server.state.streamOpens).toBe(1);
  });
});
