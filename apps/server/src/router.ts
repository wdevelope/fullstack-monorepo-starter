import { authRouter } from "./features/auth/auth.router.ts";
import { commentsRouter } from "./features/comments/comments.router.ts";
import { notificationsRouter } from "./features/notifications/notifications.router.ts";
import { postsRouter } from "./features/posts/posts.router.ts";
import { workspacesRouter } from "./features/workspaces/workspaces.router.ts";
import { base } from "./platform/context.ts";

export const router = base.router({
  auth: authRouter,
  posts: postsRouter,
  comments: commentsRouter,
  workspaces: workspacesRouter,
  notifications: notificationsRouter,
});
