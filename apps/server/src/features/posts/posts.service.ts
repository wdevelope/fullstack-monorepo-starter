import { POST_EXCERPT_LENGTH, type PostDetail, type PostSummary } from "@starter/contracts";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";

import { comments, postLikes, posts, users, workspaceMembers } from "../../db/schema.ts";
import { encodeCursor } from "../../platform/cursor.ts";
import type { Database, Executor } from "../../platform/db.ts";
import { notifyPostAuthor } from "../notifications/notifications.service.ts";
import { canModeratePost, canReadPost } from "../workspaces/access.ts";

const author = { id: users.id, nickname: users.nickname };
const likeCount = sql<number>`(SELECT count(*)::int FROM ${postLikes} WHERE ${postLikes.postId} = ${posts.id})`;
const commentCount = sql<number>`(SELECT count(*)::int FROM ${comments} WHERE ${comments.postId} = ${posts.id})`;

/**
 * 공개 게시판을, 또는 멤버에게는 워크스페이스 게시판을 나열한다. 보는 사람이 그 워크스페이스
 * 멤버가 아니면 null을 돌려준다(호출자에게는 NOT_FOUND).
 */
export async function listPosts(
  db: Database,
  options: {
    limit: number;
    after: { createdAt: string; id: string } | null;
    workspaceId: string | undefined;
    viewerId: string | null;
  },
): Promise<{ items: PostSummary[]; nextCursor: string | null } | null> {
  const { limit, after, workspaceId, viewerId } = options;
  if (workspaceId && !viewerId) return null;

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      excerpt: sql<string>`left(${posts.body}, ${POST_EXCERPT_LENGTH})`,
      author,
      workspaceId: posts.workspaceId,
      createdAt: posts.createdAt,
      commentCount,
      likeCount,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(
      and(
        workspaceId
          ? and(eq(posts.workspaceId, workspaceId), canReadPost(viewerId))
          : isNull(posts.workspaceId),
        after
          ? sql`(${posts.createdAt}, ${posts.id}) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);

  // 빈 페이지는 게시판이 비었거나 멤버가 아니라는 뜻이다. 뒤의 경우만 NOT_FOUND다.
  if (rows.length === 0 && workspaceId && !(await isMember(db, workspaceId, viewerId!))) {
    return null;
  }
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}

async function isMember(db: Executor, workspaceId: string, userId: string) {
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  return row !== undefined;
}

export async function getPost(
  db: Database,
  id: string,
  viewerId: string | null,
): Promise<PostDetail | null> {
  const likedByMe = viewerId
    ? sql<boolean>`EXISTS (SELECT 1 FROM ${postLikes} WHERE ${postLikes.postId} = ${posts.id} AND ${postLikes.userId} = ${viewerId})`
    : sql<boolean>`false`;

  const [post] = await db
    .select({
      id: posts.id,
      title: posts.title,
      body: posts.body,
      author,
      workspaceId: posts.workspaceId,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      likeCount,
      likedByMe,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(eq(posts.id, id), canReadPost(viewerId)));
  if (!post) return null;

  // 댓글 쿼리도 접근을 다시 확인하므로, 그사이 내보내진 멤버는 아무것도 읽지 못한다.
  const postComments = await db
    .select({ id: comments.id, body: comments.body, author, createdAt: comments.createdAt })
    .from(comments)
    .innerJoin(posts, eq(posts.id, comments.postId))
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.postId, id), canReadPost(viewerId)))
    .orderBy(asc(comments.createdAt), asc(comments.id));

  return { ...post, comments: postComments };
}

/** 글이 있고 보는 사람이 읽을 수 있는지 돌려준다. NOT_FOUND와 FORBIDDEN 중 하나를 고를 때만 쓴다. */
export async function postReadable(
  db: Executor,
  id: string,
  viewerId: string | null,
): Promise<boolean> {
  const [row] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, id), canReadPost(viewerId)));
  return row !== undefined;
}

/**
 * 공개 게시판에, 또는 작성자가 멤버이면 워크스페이스에 글을 쓴다. INSERT가 작성자의 멤버십
 * 행에서 SELECT하므로 멤버가 아니면 아무것도 넣지 않고, 그때는 null을 돌려준다.
 */
export async function createPost(
  db: Database,
  authorId: string,
  input: { title: string; body: string; workspaceId?: string | undefined },
): Promise<string | null> {
  const { title, body, workspaceId } = input;
  if (!workspaceId) {
    const [row] = await db
      .insert(posts)
      .values({ authorId, title, body })
      .returning({ id: posts.id });
    if (!row) throw new Error("INSERT가 행을 돌려주지 않았다");
    return row.id;
  }
  const result = await db.execute<{ id: string }>(sql`
    INSERT INTO ${posts} (author_id, workspace_id, title, body)
    SELECT ${workspaceMembers.userId}, ${workspaceMembers.workspaceId}, ${title}, ${body}
    FROM ${workspaceMembers}
    WHERE ${workspaceMembers.workspaceId} = ${workspaceId} AND ${workspaceMembers.userId} = ${authorId}
    RETURNING id`);
  return result.rows[0]?.id ?? null;
}

/** 글이 없거나, 읽을 수 없거나, 다른 사람의 글이면 false를 돌려준다. */
export async function updateOwnPost(
  db: Database,
  authorId: string,
  id: string,
  input: { title: string; body: string },
  now: Date,
): Promise<boolean> {
  const updated = await db
    .update(posts)
    .set({ ...input, updatedAt: now })
    .where(and(eq(posts.id, id), eq(posts.authorId, authorId), canReadPost(authorId)))
    .returning({ id: posts.id });
  return updated.length > 0;
}

/**
 * 작성자가 자기 글을 지운다. 워크스페이스에서는 그 관리자와 소유자도 지울 수 있다(모더레이션).
 * 댓글, 좋아요, 알림은 ON DELETE CASCADE로 글과 함께 지워진다.
 */
export async function deletePost(db: Database, userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(posts)
    .where(
      and(
        eq(posts.id, id),
        or(and(eq(posts.authorId, userId), canReadPost(userId)), canModeratePost(userId)),
      ),
    )
    .returning({ id: posts.id });
  return deleted.length > 0;
}

/**
 * 좋아요나 좋아요 취소를 알림과 한 트랜잭션에서 한다. 좋아요는 접근도 확인하는 문으로 쓰므로
 * 멤버가 아니면 아무것도 바뀌지 않는다. 글을 읽을 수 없으면 null을 돌려준다.
 */
export async function setLike(db: Database, postId: string, userId: string, liked: boolean) {
  return db.transaction(async (tx) => {
    const target = sql`SELECT ${posts.id} FROM ${posts} WHERE ${posts.id} = ${postId} AND ${canReadPost(userId)}`;
    const result = liked
      ? await tx.execute<{ id: string; inserted: boolean }>(sql`
          WITH target AS (${target}),
          added AS (
            INSERT INTO ${postLikes} (post_id, user_id)
            SELECT id, ${userId}::uuid FROM target
            ON CONFLICT DO NOTHING
            RETURNING post_id
          )
          SELECT id, EXISTS (SELECT 1 FROM added) AS inserted FROM target`)
      : await tx.execute<{ id: string; inserted: boolean }>(sql`
          WITH target AS (${target}),
          removed AS (
            DELETE FROM ${postLikes}
            WHERE post_id IN (SELECT id FROM target) AND user_id = ${userId}
          )
          SELECT id, false AS inserted FROM target`);
    const row = result.rows[0];
    if (!row) return null;
    if (row.inserted) await notifyPostAuthor(tx, { postId, actorId: userId, type: "like" });

    const [count] = await tx
      .select({ likeCount: sql<number>`count(*)::int` })
      .from(postLikes)
      .where(eq(postLikes.postId, postId));
    return { likeCount: count?.likeCount ?? 0, likedByMe: liked };
  });
}
