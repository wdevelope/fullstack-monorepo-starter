import type { Notification, NotificationType } from "@starter/contracts";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { notifications, posts, users } from "../../db/schema.ts";
import type { Executor } from "../../platform/db.ts";
import { NOTIFICATION_CHANNEL } from "../../platform/notification-hub.ts";
import { encodeCursor } from "../../platform/cursor.ts";
import { canReadPost } from "../workspaces/access.ts";

/**
 * Notifies the post's author about a comment or like, inside the caller's transaction (NOTI rule 3).
 * Nothing happens for your own posts, for a repeated like (partial unique index), or when the author
 * can no longer read the post. NOTIFY is transactional: PostgreSQL delivers it only after commit.
 */
export async function notifyPostAuthor(
  tx: Executor,
  input: { postId: string; actorId: string; type: NotificationType; commentId?: string },
): Promise<void> {
  const inserted = await tx.execute<{ id: string; recipient_id: string }>(sql`
    INSERT INTO ${notifications} (recipient_id, actor_id, type, post_id, comment_id)
    SELECT ${posts.authorId}, ${input.actorId}::uuid, ${input.type}, ${posts.id}, ${input.commentId ?? null}::uuid
    FROM ${posts}
    WHERE ${posts.id} = ${input.postId}
      AND ${posts.authorId} <> ${input.actorId}
      AND ${canReadPost(posts.authorId)}
    ON CONFLICT DO NOTHING
    RETURNING id, recipient_id`);

  for (const row of inserted.rows) {
    const payload = JSON.stringify({ id: row.id, recipientId: row.recipient_id });
    await tx.execute(sql`SELECT pg_notify(${NOTIFICATION_CHANNEL}, ${payload})`);
  }
}

const notificationFields = {
  id: notifications.id,
  type: notifications.type,
  post: { id: posts.id, title: posts.title },
  actor: { id: users.id, nickname: users.nickname },
  createdAt: notifications.createdAt,
  readAt: notifications.readAt,
};

/** A recipient only sees notifications about posts they can still read. */
function visibleTo(recipientId: string) {
  return and(eq(notifications.recipientId, recipientId), canReadPost(recipientId));
}

export async function listNotifications(
  db: Executor,
  recipientId: string,
  limit: number,
  after: { createdAt: string; id: string } | null,
): Promise<{ items: Notification[]; nextCursor: string | null }> {
  const rows = await db
    .select(notificationFields)
    .from(notifications)
    .innerJoin(posts, eq(posts.id, notifications.postId))
    .innerJoin(users, eq(users.id, notifications.actorId))
    .where(
      and(
        visibleTo(recipientId),
        after
          ? sql`(${notifications.createdAt}, ${notifications.id}) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}

/** One notification, only if it belongs to the recipient. */
export async function findNotification(
  db: Executor,
  recipientId: string,
  id: string,
): Promise<Notification | null> {
  const [row] = await db
    .select(notificationFields)
    .from(notifications)
    .innerJoin(posts, eq(posts.id, notifications.postId))
    .innerJoin(users, eq(users.id, notifications.actorId))
    .where(and(eq(notifications.id, id), visibleTo(recipientId)));
  return row ?? null;
}

export async function countUnread(db: Executor, recipientId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .innerJoin(posts, eq(posts.id, notifications.postId))
    .where(and(visibleTo(recipientId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

/** Without `ids`, marks all. The recipient condition makes other users' IDs a no-op (NOTI rule 5). */
export async function markRead(
  db: Executor,
  recipientId: string,
  ids: string[] | undefined,
  now: Date,
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(notifications.recipientId, recipientId),
        isNull(notifications.readAt),
        ids ? inArray(notifications.id, ids) : undefined,
      ),
    );
}
