import { ORPCError } from "@orpc/server";

import { base, requireUser } from "../../platform/context.ts";
import { decodeCursor } from "../../platform/cursor.ts";
import {
  countUnread,
  findNotification,
  listNotifications,
  markRead,
} from "./notifications.service.ts";

export const notificationsRouter = {
  list: base.notifications.list.use(requireUser).handler(async ({ input, context }) => {
    const after = input.cursor ? decodeCursor(input.cursor) : null;
    if (input.cursor && !after)
      throw new ORPCError("BAD_REQUEST", { message: "커서가 올바르지 않아요." });
    return listNotifications(context.db, context.userId, input.limit, after);
  }),

  unreadCount: base.notifications.unreadCount.use(requireUser).handler(async ({ context }) => {
    return { count: await countUnread(context.db, context.userId) };
  }),

  markRead: base.notifications.markRead.use(requireUser).handler(async ({ input, context }) => {
    await markRead(context.db, context.userId, input.ids, context.now());
    return { unreadCount: await countUnread(context.db, context.userId) };
  }),

  /**
   * SSE로 보내는 실시간 알림이다. 스트림은 액세스 토큰이 만료되면 끝나므로(NOTI 규칙 6) 폐기된
   * 세션은 토큰 수명 안에 알림을 그만 받는다. 클라이언트는 다시 연결한다.
   */
  stream: base.notifications.stream.use(requireUser).handler(async function* ({ context, signal }) {
    const expiresIn = Math.max(0, context.accessTokenExpiresAt.getTime() - Date.now());
    const until = AbortSignal.any([AbortSignal.timeout(expiresIn), ...(signal ? [signal] : [])]);
    // `ready`보다 먼저 구독해서, `ready`를 본 클라이언트가 그 뒤의 것을 놓치지 않게 한다.
    const ids = context.notificationHub.subscribe(context.userId, until);

    yield { type: "ready" as const, unreadCount: await countUnread(context.db, context.userId) };
    for await (const id of ids) {
      const notification = await findNotification(context.db, context.userId, id);
      if (!notification) continue;
      yield {
        type: "notification" as const,
        notification,
        unreadCount: await countUnread(context.db, context.userId),
      };
    }
  }),
};
