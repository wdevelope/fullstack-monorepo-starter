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

/** 네트워크를 쓰는 대신 호출을 기록하는 전송 계층을 가진 api 클라이언트. */
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

describe("rpc 허용 목록", () => {
  it("DESK-1 세션 절차를 뺀 절차만 정확히 허용한다", () => {
    expect([...RPC_PATHS].sort()).toEqual([
      "auth.me",
      "comments.create",
      "comments.delete",
      "notifications.list",
      "notifications.markRead",
      "notifications.unreadCount",
      "posts.create",
      "posts.delete",
      "posts.get",
      "posts.like",
      "posts.list",
      "posts.unlike",
      "posts.update",
      "workspaces.addMember",
      "workspaces.create",
      "workspaces.delete",
      "workspaces.get",
      "workspaces.list",
      "workspaces.removeMember",
      "workspaces.updateMemberRole",
    ]);
  });

  it("WS-3 워크스페이스 호출은 계약이 정규화한 이메일로 전달한다", async () => {
    const { handlers, calls } = fakeApiClient({});
    const input = { workspaceId: POST_ID, email: " Bob@Example.com " };

    await handlers.rpc("workspaces.addMember", input);

    expect(calls).toEqual([
      { path: "workspaces.addMember", input: { workspaceId: POST_ID, email: "bob@example.com" } },
    ]);
  });

  it("NOTI-6 스트림은 rpc로 부를 수 없다: 메인이 갖고 이벤트를 전달한다", async () => {
    const { handlers, calls } = fakeApiClient({});

    const result = await handlers.rpc("notifications.stream", undefined);

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(calls).toEqual([]);
  });

  it("DESK-2 허용된 호출은 계약으로 파싱한 입력으로 전달한다", async () => {
    const page = { items: [], nextCursor: null };
    const { handlers, calls } = fakeApiClient({ respond: () => page });

    const result = await handlers.rpc("posts.list", { cursor: "abc" });

    expect(result).toEqual({ ok: true, data: page });
    expect(calls).toEqual([{ path: "posts.list", input: { cursor: "abc", limit: 20 } }]);
  });

  it.each(["auth.signup", "auth.login", "auth.refresh", "auth.logout"])(
    "DESK-1 세션 절차 %s는 거부해 토큰이 IPC를 건너지 않게 한다",
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
  ])("DESK-1 허용 목록에 없는 경로 %j는 거부한다", async (path) => {
    const { handlers, calls } = fakeApiClient({});

    const result = await handlers.rpc(path, {});

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(calls).toEqual([]);
  });

  it("DESK-3 틀린 입력은 네트워크에 닿기 전에 거부한다", async () => {
    const { handlers, calls } = fakeApiClient({});

    const result = await handlers.rpc("posts.get", { id: "not-a-uuid" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "BAD_REQUEST", status: 400, data: { issues: [{ path: ["id"] }] } },
    });
    expect(calls).toEqual([]);
  });

  it("DESK-4 입력이 없는 절차에는 렌더러가 보낸 입력을 전달하지 않는다", async () => {
    const { handlers, calls } = fakeApiClient({ respond: () => user });

    await handlers.rpc("auth.me", { anything: true });

    expect(calls).toEqual([{ path: "auth.me", input: undefined }]);
  });

  it("DESK-5 서버의 타입 있는 오류는 필드를 그대로 유지해 넘긴다", async () => {
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

describe("세션 핸들러", () => {
  it("DESK-9 계약으로 파싱한 입력으로 로그인하고 사용자를 돌려준다", async () => {
    const { handlers, client } = fakeApiClient({});

    const result = await handlers.signIn({ email: "  A@Example.com ", password: "password1" });

    expect(result).toEqual({ ok: true, data: user });
    expect(client.signIn).toHaveBeenCalledWith({ email: "a@example.com", password: "password1" });
  });

  it("DESK-3 형식이 틀린 회원가입 입력은 서버를 부르지 않고 거부한다", async () => {
    const { handlers, client } = fakeApiClient({});

    const result = await handlers.signUp({ email: "nope", password: "short", nickname: "a" });

    expect(result).toMatchObject({ ok: false, error: { code: "BAD_REQUEST" } });
    expect(client.signUp).not.toHaveBeenCalled();
  });

  it("DESK-10 살아 있는 세션이 있으면 리프레시 토큰을 다시 회전하지 않고 그 세션으로 복원한다", async () => {
    const { handlers, client } = fakeApiClient({ signedIn: true });

    expect(await handlers.restore()).toEqual({ ok: true, data: user });
    expect(client.restore).not.toHaveBeenCalled();
  });

  it("DESK-10 앱을 시작할 때는 저장된 리프레시 토큰으로 복원한다", async () => {
    const { handlers, client } = fakeApiClient({ signedIn: false });

    expect(await handlers.restore()).toEqual({ ok: true, data: user });
    expect(client.restore).toHaveBeenCalledOnce();
  });

  it("DESK-10 로그아웃한 뒤에는 null을 돌려준다", async () => {
    const { handlers, client } = fakeApiClient({ signedIn: true });

    expect(await handlers.signOut()).toEqual({ ok: true, data: null });
    expect(client.signOut).toHaveBeenCalledOnce();
  });
});
