import { authContract } from "./auth.ts";
import { commentsContract, postsContract } from "./community.ts";
import { notificationsContract } from "./notifications.ts";
import { workspacesContract } from "./workspaces.ts";

export * from "./auth.ts";
export * from "./community.ts";
export * from "./notifications.ts";
export * from "./workspaces.ts";

/** 서버와 모든 클라이언트가 함께 쓰는 단 하나의 API 계약이다. */
export const contract = {
  auth: authContract,
  posts: postsContract,
  comments: commentsContract,
  workspaces: workspacesContract,
  notifications: notificationsContract,
};
export type Contract = typeof contract;
