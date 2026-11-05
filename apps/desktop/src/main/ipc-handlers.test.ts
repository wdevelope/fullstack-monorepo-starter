import { createORPCClient, ORPCError, type ClientLink } from "@orpc/client";
import type { Api, ApiClient } from "@starter/api-client";
import type { User } from "@starter/contracts";
import { describe, expect, it, vi } from "vitest";

import { createIpcHandlers, RPC_PATHS } from "./ipc-handlers.ts";

const user: User = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "a@example.com",
  nickname: "alice",
  createdAt: new Date(0),
};
const POST_ID = "00000000-0000-4000-8000-0000000000aa";

/** An api client whose transport records calls instead of using the network. */
function fakeApiClient(options: {
  signedIn?: boolean;
  respond?: (path: string, input: unknown) => unknown;
}) {
  const calls: { path: string; input: unknown }[] = [];
  const link: ClientLink<Record<never, never>> = {
    async call(path, input) {
      calls.push({ path: path.join("."), input });
      return options.respond?.(path.join("."), input) ?? {};
    },
  };
  const api: Api = createORPCClient(link);
  const client = {
    api,
    getUser: () => (options.signedIn ? user : null),
    subscribe: () => () => {},
    restore: vi.fn(async () => user),
    signUp: vi.fn(async () => user),
    signIn: vi.fn(async () => user),
    signOut: vi.fn(async () => {}),
  } satisfies ApiClient;
  return { client, calls, handlers: createIpcHandlers(client) };
}

describe("rpc allowlist", () => {
  it("allows exactly the non-session procedures", () => {
    expect([...RPC_PATHS].sort()).toEqual([
      "auth.me",
      "comments.create",
      "comments.delete",
      "posts.create",
      "posts.delete",
      "posts.get",
      "posts.like",
      "posts.list",
      "posts.unlike",
      "posts.update",
    ]);
  });

  it("forwards an allowed call with the input parsed by the contract", async () => {
    const page = { items: [], nextCursor: null };
    const { handlers, calls } = fakeApiClient({ respond: () => page });

    const result = await handlers.rpc("posts.list", { cursor: "abc" });

    expect(result).toEqual({ ok: true, data: page });
    expect(calls).toEqual([{ path: "posts.list", input: { cursor: "abc", limit: 20 } }]);
  });

  it.each(["auth.signup", "auth.login", "auth.refresh", "auth.logout"])(
    "rejects the session procedure %s so tokens never cross IPC",
    async (path) => {
      const { handlers, calls } = fakeApiClient({});

      const result = await handlers.rpc(path, { refreshToken: "x" });

      expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN", status: 403 } });
      expect(calls).toEqual([]);
    },
  );

  it.each([
    "posts",
    "posts.list.extra",
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    ["posts", "list"],
    42,
    undefined,
  ])("rejects the path %j", async (path) => {
    const { handlers, calls } = fakeApiClient({});

    const result = await handlers.rpc(path, {});

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(calls).toEqual([]);
  });

  it("rejects invalid input before it reaches the network", async () => {
    const { handlers, calls } = fakeApiClient({});

    const result = await handlers.rpc("posts.get", { id: "not-a-uuid" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "BAD_REQUEST", status: 400, data: { issues: [{ path: ["id"] }] } },
    });
    expect(calls).toEqual([]);
  });

  it("does not forward renderer input to procedures that take none", async () => {
    const { handlers, calls } = fakeApiClient({ respond: () => user });

    await handlers.rpc("auth.me", { anything: true });

    expect(calls).toEqual([{ path: "auth.me", input: undefined }]);
  });

  it("passes typed server errors through with their fields", async () => {
    const { handlers } = fakeApiClient({
      respond: () => {
        throw new ORPCError("NOT_FOUND", { defined: true, status: 404, message: "Not found." });
      },
    });

    const result = await handlers.rpc("posts.get", { id: POST_ID });

    expect(result).toEqual({
      ok: false,
      error: {
        defined: true,
        code: "NOT_FOUND",
        status: 404,
        message: "Not found.",
        data: undefined,
      },
    });
  });
});

describe("session handlers", () => {
  it("signs in with input parsed by the contract and returns the user", async () => {
    const { handlers, client } = fakeApiClient({});

    const result = await handlers.signIn({ email: "  A@Example.com ", password: "password1" });

    expect(result).toEqual({ ok: true, data: user });
    expect(client.signIn).toHaveBeenCalledWith({ email: "a@example.com", password: "password1" });
  });

  it("rejects malformed sign-up input without calling the server", async () => {
    const { handlers, client } = fakeApiClient({});

    const result = await handlers.signUp({ email: "nope", password: "short", nickname: "a" });

    expect(result).toMatchObject({ ok: false, error: { code: "BAD_REQUEST" } });
    expect(client.signUp).not.toHaveBeenCalled();
  });

  it("restores from the live session instead of rotating the refresh token again", async () => {
    const { handlers, client } = fakeApiClient({ signedIn: true });

    expect(await handlers.restore()).toEqual({ ok: true, data: user });
    expect(client.restore).not.toHaveBeenCalled();
  });

  it("restores from the stored refresh token on launch", async () => {
    const { handlers, client } = fakeApiClient({ signedIn: false });

    expect(await handlers.restore()).toEqual({ ok: true, data: user });
    expect(client.restore).toHaveBeenCalledOnce();
  });

  it("returns null after signing out", async () => {
    const { handlers, client } = fakeApiClient({ signedIn: true });

    expect(await handlers.signOut()).toEqual({ ok: true, data: null });
    expect(client.signOut).toHaveBeenCalledOnce();
  });
});
