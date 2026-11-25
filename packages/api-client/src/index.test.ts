import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { contract, type Session } from "@starter/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { createApiClient, type RefreshTokenStore } from "./index.ts";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "a@example.com",
  nickname: "alice",
  createdAt: new Date(0),
};

/**
 * 실제 계약으로 만든 가짜 서버다. 실제 회전처럼 가장 최근의 액세스 토큰(`access-N`)과
 * 리프레시 토큰(`refresh-M`)만 유효하다.
 */
function createFakeServer() {
  const state = { access: 0, refresh: 0, refreshCalls: 0 };
  const os = implement(contract).$context<{ headers: Headers }>();

  const session = (): Session => ({
    user,
    accessToken: `access-${state.access}`,
    accessTokenExpiresAt: new Date(),
    refreshToken: `refresh-${state.refresh}`,
  });

  const router = os.router({
    auth: {
      signup: os.auth.signup.handler(() => session()),
      login: os.auth.login.handler(({ input, errors }) => {
        if (input.password !== "password1") throw errors.INVALID_CREDENTIALS();
        return session();
      }),
      refresh: os.auth.refresh.handler(async ({ input, errors }) => {
        state.refreshCalls++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (input.refreshToken !== `refresh-${state.refresh}`) {
          throw errors.INVALID_REFRESH_TOKEN();
        }
        state.refresh++;
        state.access++;
        return session();
      }),
      logout: os.auth.logout.handler(() => ({})),
      me: os.auth.me.handler(({ context }) => {
        if (context.headers.get("authorization") !== `Bearer access-${state.access}`) {
          throw new ORPCError("UNAUTHORIZED");
        }
        return user;
      }),
    },
    posts: {} as never,
    comments: {} as never,
    workspaces: {} as never,
    notifications: {} as never,
  });

  const handler = new RPCHandler(router);
  async function fetch(input: RequestInfo | URL, init?: RequestInit) {
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
    /** 액세스 토큰은 더 쓸 수 없고, 리프레시 토큰은 여전히 쓸 수 있다. */
    expireAccessToken: () => state.access++,
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

describe("API 클라이언트 세션", () => {
  let server: ReturnType<typeof createFakeServer>;
  let store: ReturnType<typeof memoryStore>;
  const create = (fetch = server.fetch) =>
    createApiClient({
      url: "http://localhost/rpc",
      clientKind: "native",
      refreshTokenStore: store,
      fetch,
    });
  const credentials = { email: "a@example.com", password: "password1" };

  beforeEach(() => {
    server = createFakeServer();
    store = memoryStore();
  });

  it("AUTH-16 로그인하면 리프레시 토큰을 저장소에 두고 구독자에게 알린다", async () => {
    const client = create();
    const seen: unknown[] = [];
    client.subscribe(() => seen.push(client.getUser()));

    await client.signIn(credentials);

    expect(store.value).toBe("refresh-0");
    expect(client.getUser()).toEqual(user);
    expect(seen).toEqual([user]);
  });

  it("AUTH-16 액세스 토큰이 만료되면 한 번 리프레시하고 호출을 다시 보낸다", async () => {
    const client = create();
    await client.signIn(credentials);
    server.expireAccessToken();

    expect(await client.api.auth.me()).toEqual(user);
    expect(server.state.refreshCalls).toBe(1);
    expect(store.value).toBe("refresh-1");
  });

  it("AUTH-16 만료된 토큰을 만난 동시 호출들이 리프레시 하나를 함께 기다린다", async () => {
    const client = create();
    await client.signIn(credentials);
    server.expireAccessToken();

    const results = await Promise.all([client.api.auth.me(), client.api.auth.me()]);

    expect(results).toEqual([user, user]);
    expect(server.state.refreshCalls).toBe(1);
  });

  it("AUTH-16 익명 호출이나 실패한 로그인에는 리프레시하지 않는다", async () => {
    const client = create();

    await expect(client.api.auth.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(client.signIn({ ...credentials, password: "nope" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect(server.state.refreshCalls).toBe(0);
  });

  it("AUTH-17 서버가 리프레시 토큰을 거부하면 기기에서 로그아웃한다", async () => {
    const client = create();
    store.value = "refresh-stolen";

    expect(await client.restore()).toBeNull();
    expect(store.value).toBeNull();
    expect(client.getUser()).toBeNull();
  });

  it("AUTH-17 저장한 리프레시 토큰으로 세션을 복원한다", async () => {
    store.value = "refresh-0";
    const client = create();

    expect(await client.restore()).toEqual(user);
    expect(store.value).toBe("refresh-1");
  });

  it("AUTH-17 서버에 닿지 않아도 로그아웃하면 저장한 토큰을 지운다", async () => {
    const client = create(async () => {
      throw new TypeError("network down");
    });
    store.value = "refresh-0";

    await expect(client.signOut()).rejects.toThrow("network down");
    expect(store.value).toBeNull();
    expect(client.getUser()).toBeNull();
  });
});
