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
 * A fake server built from the real contract. Only the latest access token (`access-N`) and
 * refresh token (`refresh-M`) are valid, like the real rotation.
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
    /** The access token stops working; the refresh token still works. */
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

describe("api client session", () => {
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

  it("AUTH-16 keeps the refresh token in the store and notifies subscribers on sign-in", async () => {
    const client = create();
    const seen: unknown[] = [];
    client.subscribe(() => seen.push(client.getUser()));

    await client.signIn(credentials);

    expect(store.value).toBe("refresh-0");
    expect(client.getUser()).toEqual(user);
    expect(seen).toEqual([user]);
  });

  it("AUTH-16 refreshes and retries once when the access token has expired", async () => {
    const client = create();
    await client.signIn(credentials);
    server.expireAccessToken();

    expect(await client.api.auth.me()).toEqual(user);
    expect(server.state.refreshCalls).toBe(1);
    expect(store.value).toBe("refresh-1");
  });

  it("AUTH-16 shares one refresh between concurrent calls that hit an expired token", async () => {
    const client = create();
    await client.signIn(credentials);
    server.expireAccessToken();

    const results = await Promise.all([client.api.auth.me(), client.api.auth.me()]);

    expect(results).toEqual([user, user]);
    expect(server.state.refreshCalls).toBe(1);
  });

  it("AUTH-16 does not refresh for anonymous calls or failed sign-ins", async () => {
    const client = create();

    await expect(client.api.auth.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(client.signIn({ ...credentials, password: "nope" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect(server.state.refreshCalls).toBe(0);
  });

  it("AUTH-17 signs out locally when the server rejects the refresh token", async () => {
    const client = create();
    store.value = "refresh-stolen";

    expect(await client.restore()).toBeNull();
    expect(store.value).toBeNull();
    expect(client.getUser()).toBeNull();
  });

  it("AUTH-17 restores a session from the stored refresh token", async () => {
    store.value = "refresh-0";
    const client = create();

    expect(await client.restore()).toEqual(user);
    expect(store.value).toBe("refresh-1");
  });

  it("AUTH-17 clears the stored token on sign-out even if the server is unreachable", async () => {
    const client = create(async () => {
      throw new TypeError("network down");
    });
    store.value = "refresh-0";

    await expect(client.signOut()).rejects.toThrow("network down");
    expect(store.value).toBeNull();
    expect(client.getUser()).toBeNull();
  });
});
