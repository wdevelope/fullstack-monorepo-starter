import { eventIterator, oc } from "@orpc/contract";
import * as z from "zod";

export const notificationTypeSchema = z.enum(["comment", "like"]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/** 행동한 사람과 글만 알려 주고, 댓글 내용은 절대 담지 않는다(NOTI 규칙 8). */
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
 * 스트림이 보내는 이벤트다. 서버가 이 사용자의 알림을 듣기 시작하면 `ready`가 가장 먼저 온다.
 * 그래서 (다시) 연결한 클라이언트는 읽지 않은 개수를 알고, 끊긴 동안 놓친 것을 다시 가져올 수 있다.
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

  /** `ids`가 없으면 모든 알림을 읽음 처리한다. 다른 사용자 알림의 ID는 무시한다. */
  markRead: oc
    .input(z.object({ ids: z.array(z.uuid()).min(1).max(100).optional() }))
    .output(z.object({ unreadCount: z.number().int() })),

  /** Server-Sent Events다. 액세스 토큰이 만료되면 끝나므로 새 토큰으로 다시 연결한다. */
  stream: oc.output(eventIterator(notificationEventSchema)),
};
