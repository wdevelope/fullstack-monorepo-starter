import type { WatchNotificationsOptions } from "@starter/api-client";
import type { Notification, NotificationEvent, User } from "@starter/contracts";
import { describe, expect, it } from "vitest";

import { startNotificationForwarder } from "./notification-forwarder.ts";

const alice: User = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "a@example.com",
  nickname: "alice",
  createdAt: new Date(0),
};
const bob: User = { ...alice, id: "00000000-0000-4000-8000-000000000002", nickname: "bob" };
const notification: Notification = {
  id: "00000000-0000-4000-8000-0000000000aa",
  type: "comment",
  post: { id: "00000000-0000-4000-8000-0000000000bb", title: "Post" },
  actor: { id: bob.id, nickname: "bob" },
  createdAt: new Date(0),
  readAt: null,
};

function setUp(initialUser: User | null) {
  let user = initialUser;
  const listeners = new Set<() => void>();
  const watches: WatchNotificationsOptions[] = [];
  const sent: NotificationEvent[] = [];
  const shown: Notification[] = [];

  const stop = startNotificationForwarder({
    client: {
      api: {} as never,
      getUser: () => user,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    watch: async (_api, options) => {
      watches.push(options);
    },
    send: (event) => sent.push(event),
    show: (n) => shown.push(n),
  });
  const setUser = (next: User | null) => {
    user = next;
    for (const listener of listeners) listener();
  };
  return { watches, sent, shown, stop, setUser };
}

describe("notification forwarder", () => {
  it("NOTI-6 forwards stream events to the renderer and shows a system notification", () => {
    const { watches, sent, shown } = setUp(alice);
    expect(watches).toHaveLength(1);

    watches[0]!.onEvent({ type: "ready", unreadCount: 0 });
    watches[0]!.onEvent({ type: "notification", notification, unreadCount: 1 });

    expect(sent.map((e) => e.type)).toEqual(["ready", "notification"]);
    expect(shown).toEqual([notification]);
  });

  it("NOTI-8 watches only while signed in and restarts for a different user", () => {
    const { watches, setUser, stop } = setUp(null);
    expect(watches).toHaveLength(0);

    setUser(alice);
    expect(watches).toHaveLength(1);
    setUser(alice);
    expect(watches).toHaveLength(1);

    setUser(bob);
    expect(watches[0]!.signal.aborted).toBe(true);
    expect(watches).toHaveLength(2);

    setUser(null);
    expect(watches[1]!.signal.aborted).toBe(true);

    setUser(alice);
    stop();
    expect(watches[2]!.signal.aborted).toBe(true);
  });
});
