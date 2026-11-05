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
 * The renderer is untrusted, so main parses its input with the contract's own schema before
 * anything is sent. The error matches what the server returns for the same mistake.
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
      message: "Input validation failed",
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
 * Everything the renderer may call through `rpc`. The type requires exactly the paths of
 * `RendererContract`, so a session procedure cannot be added here by accident.
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
  // Own keys only, so "constructor" or "__proto__" never resolve to something callable.
  return typeof path === "string" && Object.hasOwn(RPC_PROCEDURES, path);
}

/**
 * The IPC handlers, free of Electron so they can be tested. Every result is plain data: the user
 * (never a token) or a serialised error.
 */
export function createIpcHandlers(client: ApiClient) {
  return {
    // A renderer reload must not rotate the refresh token again while main still has a session.
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
            message: "This procedure is not available to the renderer.",
          });
        }
        return RPC_PROCEDURES[path](client.api, input);
      }),
  };
}
