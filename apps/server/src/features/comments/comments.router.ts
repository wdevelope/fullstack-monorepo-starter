import { and, eq, sql } from "drizzle-orm";

import { comments, posts, users } from "../../db/schema.ts";
import { base, requireUser } from "../../platform/context.ts";
import { notifyPostAuthor } from "../notifications/notifications.service.ts";
import { canModeratePost, canReadPost } from "../workspaces/access.ts";

export const commentsRouter = {
  create: base.comments.create.use(requireUser).handler(async ({ input, context, errors }) => {
    const { postId, body } = input;
    const userId = context.userId;
    // The comment and its notification commit together (NOTI rule 3). The insert selects from
    // the post with the access check, so a caller who cannot read the post inserts nothing.
    const comment = await context.db.transaction(async (tx) => {
      const inserted = await tx.execute<{ id: string }>(sql`
        INSERT INTO ${comments} (post_id, author_id, body)
        SELECT ${posts.id}, ${userId}::uuid, ${body}
        FROM ${posts}
        WHERE ${posts.id} = ${postId} AND ${canReadPost(userId)}
        RETURNING id`);
      const id = inserted.rows[0]?.id;
      if (!id) return null;
      await notifyPostAuthor(tx, { postId, actorId: userId, type: "comment", commentId: id });

      const [row] = await tx
        .select({
          id: comments.id,
          body: comments.body,
          author: { id: users.id, nickname: users.nickname },
          createdAt: comments.createdAt,
        })
        .from(comments)
        .innerJoin(users, eq(users.id, comments.authorId))
        .where(eq(comments.id, id));
      return row ?? null;
    });
    if (!comment) throw errors.NOT_FOUND();
    return comment;
  }),

  /** The author deletes; in a workspace its admins and owner can too. Its notifications cascade. */
  delete: base.comments.delete.use(requireUser).handler(async ({ input, context, errors }) => {
    const userId = context.userId;
    const deleted = await context.db
      .delete(comments)
      .where(
        and(
          eq(comments.id, input.id),
          sql`EXISTS (
            SELECT 1 FROM ${posts} WHERE ${posts.id} = ${comments.postId} AND (
              (${comments.authorId} = ${userId} AND ${canReadPost(userId)}) OR ${canModeratePost(userId)}
            )
          )`,
        ),
      )
      .returning({ id: comments.id });
    if (deleted.length > 0) return {};

    const [readable] = await context.db
      .select({ id: comments.id })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .where(and(eq(comments.id, input.id), canReadPost(userId)));
    throw readable ? errors.FORBIDDEN() : errors.NOT_FOUND();
  }),
};
