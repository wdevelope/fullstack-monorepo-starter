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
 * Lists the public board, or a workspace board for its members. Returns null when the viewer
 * is not a member of the workspace (NOT_FOUND to the caller).
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

  // An empty page is either an empty board or no membership; only the second is NOT_FOUND.
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

  // The comments query checks access again, so a member removed in between reads nothing.
  const postComments = await db
    .select({ id: comments.id, body: comments.body, author, createdAt: comments.createdAt })
    .from(comments)
    .innerJoin(posts, eq(posts.id, comments.postId))
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.postId, id), canReadPost(viewerId)))
    .orderBy(asc(comments.createdAt), asc(comments.id));

  return { ...post, comments: postComments };
}

/** Whether the post exists and the viewer may read it. Used only to pick NOT_FOUND or FORBIDDEN. */
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
 * Creates a post on the public board, or in a workspace when the author is a member: the insert
 * selects from the author's membership row, so a non-member inserts nothing. Returns null then.
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
    if (!row) throw new Error("Insert returned no row");
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

/** Returns false when the post does not exist, cannot be read, or belongs to someone else. */
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
 * The author deletes their post; in a workspace its admins and owner can too (moderation).
 * Comments, likes and notifications go with the post through ON DELETE CASCADE.
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
 * Likes or unlikes in one transaction with the notification. The like is written by a statement
 * that also checks access, so a non-member changes nothing. Returns null when the post is not
 * readable.
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
