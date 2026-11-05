# Notifications

- **Status**: Approved (2026-11-05)
- **Code**: `packages/contracts/src/notifications.ts`, `apps/server/src/features/notifications/`, notification writes in `apps/server/src/features/posts/` and `apps/server/src/features/comments/`, `packages/api-client/`

## Goal

Authors hear about activity on their posts as it happens. When someone comments on or likes your post, you get a notification in an inbox with an unread count, and every open client of yours receives it live over Server-Sent Events. Delivery works when the API runs as several instances, because the fan-out goes through PostgreSQL rather than process memory.

## Rules

1. A comment or a like on someone else's post creates one notification for the post's author. Your own actions on your own posts never notify you.
2. Likes notify at most once per liker and post, even after unlike and like again. A partial unique index enforces it.
3. The notification is written in the same transaction as the comment or like, so the two cannot diverge.
4. After the transaction commits, the server sends `NOTIFY` on a PostgreSQL channel with the notification ID. Every server instance `LISTEN`s and pushes it to that recipient's open streams. A stream only ever carries its own user's notifications.
5. Users read and mark only their own notifications. IDs belonging to someone else are ignored.
6. The stream needs a valid access token and ends when that token expires; the client reconnects with a fresh token. A revoked session therefore stops receiving within one token lifetime (15 minutes).
7. Deleting a post or comment deletes the notifications that point at it.
8. A notification shows the actor's nickname and the post title, never the comment text.

## Scenarios

| ID     | Given / When                                                             | Then                                                                                 |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| NOTI-1 | B comments on A's post                                                   | A has one unread `comment` notification naming B and the post title                  |
| NOTI-2 | A comments on or likes their own post                                    | No notification                                                                      |
| NOTI-3 | B likes A's post twice, then unlikes and likes again                     | A has exactly one `like` notification from B for that post                           |
| NOTI-4 | A lists notifications                                                    | Newest first with a cursor, only A's own                                             |
| NOTI-5 | A marks some notifications read, then all                                | The unread count drops accordingly; IDs of other users' notifications change nothing |
| NOTI-6 | A and C have open streams and B comments on A's post                     | A's stream receives the notification; C's stream receives nothing                    |
| NOTI-7 | A's stream is open on one server instance and B comments through another | A's stream receives the notification                                                 |
| NOTI-8 | A stream is opened without a valid access token, or the token expires    | `UNAUTHORIZED` at open; an open stream ends at token expiry                          |
| NOTI-9 | A post with notifications is deleted                                     | Its notifications are gone                                                           |

## Contract

`notifications.list` (cursor), `notifications.unreadCount`, `notifications.markRead` (`ids` optional; without it, all), `notifications.stream` (event iterator over SSE). A notification is `{ id, type: "comment" | "like", post: { id, title }, actor: { id, nickname }, createdAt, readAt }`.

## Data

- `notifications`: `recipient_id`, `actor_id`, `type`, `post_id` (cascade), `comment_id` (nullable, cascade), `created_at`, `read_at`; index on `(recipient_id, created_at DESC, id DESC)`; partial unique index on `(post_id, actor_id)` where `type = 'like'`.
- PostgreSQL channel `notifications`, payload `{ id, recipientId }`.
