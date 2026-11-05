import { authContract } from "./auth.ts";
import { commentsContract, postsContract } from "./community.ts";

export * from "./auth.ts";
export * from "./community.ts";

/** The single API contract shared by the server and every client. */
export const contract = {
  auth: authContract,
  posts: postsContract,
  comments: commentsContract,
};
export type Contract = typeof contract;
