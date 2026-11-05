import { POST_EXCERPT_LENGTH, type PostDetail, type PostSummary } from "@starter/contracts";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import * as z from "zod";

import { comments, postLikes, posts, users } from "../../db/schema.ts";
import type { Database } from "../../platform/db.ts";

const author = { id: users.id, nickname: users.nickname };
const likeCount = sql<number>`(SELECT count(*)::int FROM ${postLikes} WHERE ${postLikes.postId} = ${posts.id})`;
const commentCount = sql<number>`(SELECT count(*)::int FROM ${comments} WHERE ${comments.postId} = ${posts.id})`;

const cursorSchema = z.tuple([z.iso.datetime(), z.uuid()]);

/** The cursor is the (created_at, id) of the last item, so new posts never shift later pages. */
export function encodeCursor(item: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify([item.createdAt.toISOString(), item.id])).toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
    return parsed.success ? { createdAt: parsed.data[0], id: parsed.data[1] } : null;
  } catch {
    return null;
  }
}

export async function listPosts(
  db: Database,
  limit: number,
  after: { createdAt: string; id: string } | null,
): Promise<{ items: PostSummary[]; nextCursor: string | null }> {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      excerpt: sql<string>`left(${posts.body}, ${POST_EXCERPT_LENGTH})`,
      author,
      createdAt: posts.createdAt,
      commentCount,
      likeCount,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(
      after
        ? sql`(${posts.createdAt}, ${posts.id}) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`
        : undefined,
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
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
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      likeCount,
      likedByMe,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.id, id));
  if (!post) return null;

  const postComments = await db
    .select({ id: comments.id, body: comments.body, author, createdAt: comments.createdAt })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.postId, id))
    .orderBy(asc(comments.createdAt), asc(comments.id));

  return { ...post, comments: postComments };
}

export async function postExists(db: Database, id: string): Promise<boolean> {
  const [row] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, id));
  return row !== undefined;
}

export async function createPost(
  db: Database,
  authorId: string,
  input: { title: string; body: string },
): Promise<string> {
  const [row] = await db
    .insert(posts)
    .values({ authorId, ...input })
    .returning({ id: posts.id });
  if (!row) throw new Error("Insert returned no row");
  return row.id;
}

/** Returns false when the post does not exist or belongs to someone else. */
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
    .where(and(eq(posts.id, id), eq(posts.authorId, authorId)))
    .returning({ id: posts.id });
  return updated.length > 0;
}

/** Comments and likes go with the post through ON DELETE CASCADE. */
export async function deleteOwnPost(db: Database, authorId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(posts)
    .where(and(eq(posts.id, id), eq(posts.authorId, authorId)))
    .returning({ id: posts.id });
  return deleted.length > 0;
}

export async function setLike(db: Database, postId: string, userId: string, liked: boolean) {
  if (liked) {
    await db.insert(postLikes).values({ postId, userId }).onConflictDoNothing();
  } else {
    await db
      .delete(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
  }
  const [row] = await db
    .select({ likeCount: sql<number>`count(*)::int` })
    .from(postLikes)
    .where(eq(postLikes.postId, postId));
  return { likeCount: row?.likeCount ?? 0, likedByMe: liked };
}
