import { eventIterator, oc } from "@orpc/contract";
import * as z from "zod";

export const notificationTypeSchema = z.enum(["comment", "like"]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/** Names the actor and the post, never the comment text (NOTI rule 8). */
export const notificationSchema = z.object({
  id: z.uuid(),
  type: notificationTypeSchema,
  post: z.object({ id: z.uuid(), title: z.string() }),
  actor: z.object({ id: z.uuid(), nickname: z.string() }),
  createdAt: z.date(),
  readAt: z.date().nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;

/**
 * What the stream sends. `ready` comes first, once the server is listening for this user, so a
 * client that (re)connects knows the unread count and can refetch anything it missed while away.
 */
export const notificationEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), unreadCount: z.number().int() }),
  z.object({
    type: z.literal("notification"),
    notification: notificationSchema,
    unreadCount: z.number().int(),
  }),
]);
export type NotificationEvent = z.infer<typeof notificationEventSchema>;

export const notificationsContract = {
  list: oc
    .input(
      z.object({
        cursor: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .output(z.object({ items: z.array(notificationSchema), nextCursor: z.string().nullable() })),

  unreadCount: oc.output(z.object({ count: z.number().int() })),

  /** Without `ids`, marks every notification read. IDs of other users' notifications are ignored. */
  markRead: oc
    .input(z.object({ ids: z.array(z.uuid()).min(1).max(100).optional() }))
    .output(z.object({ unreadCount: z.number().int() })),

  /** Server-Sent Events. Ends when the access token expires; reconnect with a fresh one. */
  stream: oc.output(eventIterator(notificationEventSchema)),
};
