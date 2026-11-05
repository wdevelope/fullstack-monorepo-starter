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
    if (input.cursor && !after) throw new ORPCError("BAD_REQUEST", { message: "Invalid cursor." });
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
   * Live notifications over SSE. The stream ends when the access token expires (NOTI rule 6), so
   * a revoked session stops receiving within one token lifetime; the client reconnects.
   */
  stream: base.notifications.stream.use(requireUser).handler(async function* ({ context, signal }) {
    const expiresIn = Math.max(0, context.accessTokenExpiresAt.getTime() - Date.now());
    const until = AbortSignal.any([AbortSignal.timeout(expiresIn), ...(signal ? [signal] : [])]);
    // Subscribe before `ready`, so a client that saw `ready` misses nothing after it.
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
