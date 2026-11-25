import type { Notification, NotificationType } from "@starter/contracts";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { notifications, posts, users } from "../../db/schema.ts";
import type { Executor } from "../../platform/db.ts";
import { NOTIFICATION_CHANNEL } from "../../platform/notification-hub.ts";
import { encodeCursor } from "../../platform/cursor.ts";
import { canReadPost } from "../workspaces/access.ts";

/**
 * 호출자의 트랜잭션 안에서 글 작성자에게 댓글이나 좋아요를 알린다(NOTI 규칙 3). 자기 글이거나,
 * 반복된 좋아요이거나(부분 고유 인덱스), 작성자가 더는 글을 읽을 수 없으면 아무 일도 없다.
 * NOTIFY는 트랜잭션을 따르므로 PostgreSQL이 커밋한 뒤에만 전달한다.
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

/** 받는 사람은 아직 읽을 수 있는 글에 대한 알림만 본다. */
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

/** 알림 하나를 돌려준다. 받는 사람의 알림일 때만 돌려준다. */
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

/** `ids`가 없으면 전부 읽음 처리한다. 받는 사람 조건 때문에 다른 사용자의 ID는 아무것도 바꾸지 않는다(NOTI 규칙 5). */
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
