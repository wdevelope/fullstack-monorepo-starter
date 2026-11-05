import { authContract } from "./auth.ts";
import { commentsContract, postsContract } from "./community.ts";
import { notificationsContract } from "./notifications.ts";
import { workspacesContract } from "./workspaces.ts";

export * from "./auth.ts";
export * from "./community.ts";
export * from "./notifications.ts";
export * from "./workspaces.ts";

/** The single API contract shared by the server and every client. */
export const contract = {
  auth: authContract,
  posts: postsContract,
  comments: commentsContract,
  workspaces: workspacesContract,
  notifications: notificationsContract,
};
export type Contract = typeof contract;
