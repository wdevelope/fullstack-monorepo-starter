import { and, eq } from "drizzle-orm";

import { comments, users } from "../../db/schema.ts";
import { base, requireUser } from "../../platform/context.ts";
import { postExists } from "../posts/posts.service.ts";

export const commentsRouter = {
  create: base.comments.create.use(requireUser).handler(async ({ input, context, errors }) => {
    if (!(await postExists(context.db, input.postId))) throw errors.NOT_FOUND();

    const [comment] = await context.db
      .insert(comments)
      .values({ postId: input.postId, authorId: context.userId, body: input.body })
      .returning({ id: comments.id, body: comments.body, createdAt: comments.createdAt });
    const [author] = await context.db
      .select({ id: users.id, nickname: users.nickname })
      .from(users)
      .where(eq(users.id, context.userId));
    if (!comment || !author) throw new Error("Comment insert returned no row");
    return { ...comment, author };
  }),

  delete: base.comments.delete.use(requireUser).handler(async ({ input, context, errors }) => {
    const deleted = await context.db
      .delete(comments)
      .where(and(eq(comments.id, input.id), eq(comments.authorId, context.userId)))
      .returning({ id: comments.id });
    if (deleted.length > 0) return {};

    const [existing] = await context.db
      .select({ id: comments.id })
      .from(comments)
      .where(eq(comments.id, input.id));
    throw existing ? errors.FORBIDDEN() : errors.NOT_FOUND();
  }),
};
