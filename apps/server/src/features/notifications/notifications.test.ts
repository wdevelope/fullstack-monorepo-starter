import type { NotificationEvent } from "@starter/contracts";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestApp, TEST_JWT_SECRET, type Api } from "../../../test/test-app.ts";
import { signAccessToken } from "../auth/tokens.ts";

const t = createTestApp();
beforeEach(() => t.reset());
afterAll(() => t.close());

const openStreams: AbortController[] = [];
afterEach(() => {
  for (const controller of openStreams.splice(0)) controller.abort();
});

/** Opens a stream and waits for `ready`, after which the server is listening for this user. */
async function openStream(api: Api) {
  const controller = new AbortController();
  openStreams.push(controller);
  const iterator = await api.notifications.stream(undefined, { signal: controller.signal });
  const first = await iterator.next();
  expect(first.value).toMatchObject({ type: "ready" });

  /** The next event, `"ended"` when the stream finished, or `"timeout"` if nothing came. */
  async function next(timeoutMs = 2_000): Promise<NotificationEvent | "ended" | "timeout"> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const result = await Promise.race([
      iterator.next().then((r) => (r.done ? ("ended" as const) : r.value)),
      timeout,
    ]);
    clearTimeout(timer);
    return result;
  }
  return { ready: first.value, next };
}

/** A writes a post; B and C are other users. */
async function setUp() {
  const a = await t.signUp("alice");
  const b = await t.signUp("bob");
  const c = await t.signUp("carol");
  const { id: postId } = await a.api.posts.create({ title: "Alice's post", body: "Body" });
  return { a, b, c, postId };
}

async function notificationCount(postId: string) {
  const result = await t.db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM notifications WHERE post_id = ${postId}`,
  );
  return result.rows[0]?.n;
}

describe("notifications", () => {
  it("NOTI-1 tells the author about a comment, naming the actor and the post", async () => {
    const { a, b, postId } = await setUp();
    await b.api.comments.create({ postId, body: "secret comment text" });

    const { items } = await a.api.notifications.list({});
    expect(items).toEqual([
      {
        id: expect.any(String),
        type: "comment",
        post: { id: postId, title: "Alice's post" },
        actor: { id: b.session.user.id, nickname: "bob" },
        createdAt: expect.any(Date),
        readAt: null,
      },
    ]);
    expect(JSON.stringify(items)).not.toContain("secret comment text");
    expect(await a.api.notifications.unreadCount()).toEqual({ count: 1 });
  });

  it("NOTI-1 does not notify an author who can no longer read the workspace post", async () => {
    const owner = await t.signUp("owner");
    const writer = await t.signUp("writer");
    const workspace = await owner.api.workspaces.create({ name: "Team" });
    await owner.api.workspaces.addMember({
      workspaceId: workspace.id,
      email: "writer@example.com",
    });
    const { id: postId } = await writer.api.posts.create({
      title: "Old post",
      body: "Body",
      workspaceId: workspace.id,
    });
    await owner.api.workspaces.removeMember({
      workspaceId: workspace.id,
      userId: writer.session.user.id,
    });

    await owner.api.comments.create({ postId, body: "after removal" });
    await owner.api.posts.like({ id: postId });
    expect(await writer.api.notifications.unreadCount()).toEqual({ count: 0 });
  });

  it("NOTI-2 never notifies people about their own activity", async () => {
    const { a, postId } = await setUp();
    await a.api.comments.create({ postId, body: "my own comment" });
    await a.api.posts.like({ id: postId });

    expect((await a.api.notifications.list({})).items).toEqual([]);
    expect(await notificationCount(postId)).toBe(0);
  });

  it("NOTI-3 notifies a like once per liker and post, even after unlike and like", async () => {
    const { a, b, postId } = await setUp();
    await b.api.posts.like({ id: postId });
    await b.api.posts.like({ id: postId });
    await b.api.posts.unlike({ id: postId });
    expect(await b.api.posts.like({ id: postId })).toEqual({ likeCount: 1, likedByMe: true });

    const { items } = await a.api.notifications.list({});
    expect(items.map((n) => [n.type, n.actor.nickname])).toEqual([["like", "bob"]]);
  });

  it("NOTI-4 lists only the caller's notifications, newest first, with a cursor", async () => {
    const { a, b, c, postId } = await setUp();
    const { id: carolsPost } = await c.api.posts.create({ title: "Carol's", body: "Body" });
    await b.api.comments.create({ postId, body: "1" });
    await c.api.comments.create({ postId, body: "2" });
    await b.api.posts.like({ id: postId });
    await b.api.comments.create({ postId: carolsPost, body: "for carol" });

    const first = await a.api.notifications.list({ limit: 2 });
    const second = await a.api.notifications.list({ limit: 2, cursor: first.nextCursor! });
    expect([...first.items, ...second.items].map((n) => [n.type, n.actor.nickname])).toEqual([
      ["like", "bob"],
      ["comment", "carol"],
      ["comment", "bob"],
    ]);
    expect(second.nextCursor).toBeNull();
    expect((await c.api.notifications.list({})).items.map((n) => n.post.id)).toEqual([carolsPost]);
    await expect(a.api.notifications.list({ cursor: "broken" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(t.client({ kind: "native" }).notifications.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("NOTI-5 marks chosen notifications read, then all, ignoring other users' IDs", async () => {
    const { a, b, c, postId } = await setUp();
    const { id: carolsPost } = await c.api.posts.create({ title: "Carol's", body: "Body" });
    for (const body of ["1", "2", "3"]) await b.api.comments.create({ postId, body });
    await b.api.comments.create({ postId: carolsPost, body: "for carol" });
    const [carolsNotification] = (await c.api.notifications.list({})).items;
    const [newest] = (await a.api.notifications.list({})).items;

    expect(await a.api.notifications.markRead({ ids: [newest!.id] })).toEqual({ unreadCount: 2 });
    expect(await a.api.notifications.markRead({ ids: [carolsNotification!.id] })).toEqual({
      unreadCount: 2,
    });
    expect(await c.api.notifications.unreadCount()).toEqual({ count: 1 });
    expect((await a.api.notifications.list({})).items[0]!.readAt).toBeInstanceOf(Date);

    expect(await a.api.notifications.markRead({})).toEqual({ unreadCount: 0 });
    expect(await a.api.notifications.unreadCount()).toEqual({ count: 0 });
    expect(await c.api.notifications.unreadCount()).toEqual({ count: 1 });
  });

  it("NOTI-6 pushes a notification to the recipient's stream only", async () => {
    const { a, b, c, postId } = await setUp();
    const aliceStream = await openStream(a.api);
    const carolStream = await openStream(c.api);
    expect(aliceStream.ready).toEqual({ type: "ready", unreadCount: 0 });

    await b.api.comments.create({ postId, body: "hello" });

    expect(await aliceStream.next()).toMatchObject({
      type: "notification",
      unreadCount: 1,
      notification: { type: "comment", actor: { nickname: "bob" }, post: { id: postId } },
    });
    expect(await carolStream.next(500)).toBe("timeout");
  });

  it("NOTI-7 delivers across server instances through PostgreSQL", async () => {
    const other = createTestApp();
    try {
      await other.ready();
      const { a, b, postId } = await setUp();
      const onOther = other.client({ kind: "native", accessToken: a.session.accessToken });
      const stream = await openStream(onOther);

      await b.api.posts.like({ id: postId });

      expect(await stream.next()).toMatchObject({
        type: "notification",
        notification: { type: "like", actor: { nickname: "bob" } },
      });
    } finally {
      for (const controller of openStreams.splice(0)) controller.abort();
      await other.close();
    }
  });

  it("NOTI-8 needs a valid access token and ends when it expires", async () => {
    const { a } = await setUp();
    for (const accessToken of [undefined, "not-a-token"]) {
      await expect(
        t.client({ kind: "native", accessToken }).notifications.stream(),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }

    const shortLived = await signAccessToken(a.session.user.id, "native", TEST_JWT_SECRET, 1);
    const stream = await openStream(t.client({ kind: "native", accessToken: shortLived.token }));
    expect(await stream.next(3_000)).toBe("ended");
  });

  it("NOTI-9 deletes notifications with the post or comment they point at", async () => {
    const { a, b, postId } = await setUp();
    const comment = await b.api.comments.create({ postId, body: "to be deleted" });
    await b.api.comments.create({ postId, body: "stays" });
    await b.api.posts.like({ id: postId });
    expect(await notificationCount(postId)).toBe(3);

    await b.api.comments.delete({ id: comment.id });
    expect(await notificationCount(postId)).toBe(2);

    await a.api.posts.delete({ id: postId });
    expect(await notificationCount(postId)).toBe(0);
    expect((await a.api.notifications.list({})).items).toEqual([]);
  });
});
