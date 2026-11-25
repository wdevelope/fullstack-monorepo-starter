import { ORPCError } from "@orpc/client";
import type { Schema, SchemaIssue } from "@orpc/contract";
import type { Api, ApiClient } from "@starter/api-client";
import { contract } from "@starter/contracts";

import { toIpcResult } from "../shared/ipc-errors.ts";
import type { RpcPath } from "../shared/ipc.ts";

type Forwarder = (api: Api, input: unknown) => Promise<unknown>;

function issuePath(issue: SchemaIssue): string[] {
  return (issue.path ?? []).map((segment) =>
    String(typeof segment === "object" ? segment.key : segment),
  );
}

/**
 * 렌더러는 믿을 수 없으므로 메인은 무엇이든 보내기 전에 계약의 스키마로 입력을 파싱한다.
 * 오류는 같은 실수에 서버가 돌려주는 것과 같은 모양이다.
 */
async function parseInput<T>(
  procedure: { "~orpc": { inputSchema?: Schema<unknown, T> } },
  input: unknown,
): Promise<T> {
  const schema = procedure["~orpc"].inputSchema;
  if (!schema) throw new Error("This procedure has no input schema");
  const result = await schema["~standard"].validate(input);
  if (result.issues) {
    throw new ORPCError("BAD_REQUEST", {
      message: "입력값 검증에 실패했어요.",
      data: {
        issues: result.issues.map((issue) => ({ message: issue.message, path: issuePath(issue) })),
      },
    });
  }
  return result.value;
}

function forward<T>(
  procedure: { "~orpc": { inputSchema?: Schema<unknown, T> } },
  call: (api: Api, input: T) => Promise<unknown>,
): Forwarder {
  return async (api, input) => call(api, await parseInput(procedure, input));
}

/**
 * 렌더러가 `rpc`로 부를 수 있는 전부다. 타입이 `RendererContract`의 경로와 정확히 같기를 요구하므로
 * 세션 절차를 실수로 여기에 넣을 수 없다.
 */
const RPC_PROCEDURES: Record<RpcPath, Forwarder> = {
  "auth.me": (api) => api.auth.me(),
  "posts.list": forward(contract.posts.list, (api, input) => api.posts.list(input)),
  "posts.get": forward(contract.posts.get, (api, input) => api.posts.get(input)),
  "posts.create": forward(contract.posts.create, (api, input) => api.posts.create(input)),
  "posts.update": forward(contract.posts.update, (api, input) => api.posts.update(input)),
  "posts.delete": forward(contract.posts.delete, (api, input) => api.posts.delete(input)),
  "posts.like": forward(contract.posts.like, (api, input) => api.posts.like(input)),
  "posts.unlike": forward(contract.posts.unlike, (api, input) => api.posts.unlike(input)),
  "comments.create": forward(contract.comments.create, (api, input) => api.comments.create(input)),
  "comments.delete": forward(contract.comments.delete, (api, input) => api.comments.delete(input)),
  "workspaces.create": forward(contract.workspaces.create, (api, input) =>
    api.workspaces.create(input),
  ),
  "workspaces.list": (api) => api.workspaces.list(),
  "workspaces.get": forward(contract.workspaces.get, (api, input) => api.workspaces.get(input)),
  "workspaces.addMember": forward(contract.workspaces.addMember, (api, input) =>
    api.workspaces.addMember(input),
  ),
  "workspaces.updateMemberRole": forward(contract.workspaces.updateMemberRole, (api, input) =>
    api.workspaces.updateMemberRole(input),
  ),
  "workspaces.removeMember": forward(contract.workspaces.removeMember, (api, input) =>
    api.workspaces.removeMember(input),
  ),
  "workspaces.delete": forward(contract.workspaces.delete, (api, input) =>
    api.workspaces.delete(input),
  ),
  "notifications.list": forward(contract.notifications.list, (api, input) =>
    api.notifications.list(input),
  ),
  "notifications.unreadCount": (api) => api.notifications.unreadCount(),
  "notifications.markRead": forward(contract.notifications.markRead, (api, input) =>
    api.notifications.markRead(input),
  ),
};

export const RPC_PATHS: readonly string[] = Object.keys(RPC_PROCEDURES);

function isRpcPath(path: unknown): path is RpcPath {
  // 자체 키만 보므로 "constructor"나 "__proto__"가 호출할 수 있는 무언가로 풀리지 않는다.
  return typeof path === "string" && Object.hasOwn(RPC_PROCEDURES, path);
}

/**
 * IPC 핸들러. 테스트할 수 있도록 Electron에 의존하지 않는다. 결과는 모두 평범한 데이터로,
 * 사용자(토큰은 절대 아님)이거나 직렬화한 오류다.
 */
export function createIpcHandlers(client: ApiClient) {
  return {
    // 메인에 아직 세션이 있으면 렌더러를 새로고침해도 리프레시 토큰을 다시 회전하지 않는다.
    restore: () => toIpcResult(async () => client.getUser() ?? (await client.restore())),

    signIn: (input: unknown) =>
      toIpcResult(async () => client.signIn(await parseInput(contract.auth.login, input))),

    signUp: (input: unknown) =>
      toIpcResult(async () => client.signUp(await parseInput(contract.auth.signup, input))),

    signOut: () =>
      toIpcResult(async () => {
        await client.signOut();
        return null;
      }),

    rpc: (path: unknown, input: unknown) =>
      toIpcResult(async () => {
        if (!isRpcPath(path)) {
          throw new ORPCError("FORBIDDEN", {
            message: "렌더러에서는 부를 수 없는 절차예요.",
          });
        }
        return RPC_PROCEDURES[path](client.api, input);
      }),
  };
}
