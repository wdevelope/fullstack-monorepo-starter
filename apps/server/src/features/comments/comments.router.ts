import { and, eq, sql } from "drizzle-orm";

import { comments, posts, users } from "../../db/schema.ts";
import { base, requireUser } from "../../platform/context.ts";
import { notifyPostAuthor } from "../notifications/notifications.service.ts";
import { canModeratePost, canReadPost } from "../workspaces/access.ts";

export const commentsRouter = {
  create: base.comments.create.use(requireUser).handler(async ({ input, context, errors }) => {
    const { postId, body } = input;
    const userId = context.userId;
    // 댓글과 그 알림은 함께 커밋된다(NOTI 규칙 3). INSERT가 접근 확인을 붙여 글에서 SELECT하므로,
    // 글을 읽을 수 없는 호출자는 아무것도 넣지 못한다.
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

  /** 작성자가 지운다. 워크스페이스에서는 그 관리자와 소유자도 지울 수 있다. 댓글의 알림은 연쇄로 지워진다. */
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
