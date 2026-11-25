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

/** 스트림을 열고 `ready`를 기다린다. 그 뒤로는 서버가 이 사용자의 알림을 듣고 있다. */
async function openStream(api: Api) {
  const controller = new AbortController();
  openStreams.push(controller);
  const iterator = await api.notifications.stream(undefined, { signal: controller.signal });
  const first = await iterator.next();
  expect(first.value).toMatchObject({ type: "ready" });

  /** 다음 이벤트다. 스트림이 끝났으면 `"ended"`, 아무것도 오지 않았으면 `"timeout"`이다. */
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

/** A가 글을 쓴다. B와 C는 다른 사용자다. */
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

describe("알림", () => {
  it("NOTI-1 댓글이 달리면 작성자에게 행동한 사람과 글을 알린다", async () => {
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

  it("NOTI-1 워크스페이스 글을 더는 읽을 수 없는 작성자에게는 알리지 않는다", async () => {
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

  it("NOTI-2 자기 활동으로는 알림을 보내지 않는다", async () => {
    const { a, postId } = await setUp();
    await a.api.comments.create({ postId, body: "my own comment" });
    await a.api.posts.like({ id: postId });

    expect((await a.api.notifications.list({})).items).toEqual([]);
    expect(await notificationCount(postId)).toBe(0);
  });

  it("NOTI-3 좋아요는 취소했다가 다시 눌러도 누른 사람과 글 한 쌍에 한 번만 알린다", async () => {
    const { a, b, postId } = await setUp();
    await b.api.posts.like({ id: postId });
    await b.api.posts.like({ id: postId });
    await b.api.posts.unlike({ id: postId });
    expect(await b.api.posts.like({ id: postId })).toEqual({ likeCount: 1, likedByMe: true });

    const { items } = await a.api.notifications.list({});
    expect(items.map((n) => [n.type, n.actor.nickname])).toEqual([["like", "bob"]]);
  });

  it("NOTI-4 호출자의 알림만 최신순으로 커서와 함께 나열한다", async () => {
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

  it("NOTI-5 고른 알림을 읽음 처리한 뒤 전부 읽음 처리하고, 다른 사용자의 ID는 무시한다", async () => {
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

  it("NOTI-6 받는 사람의 스트림에만 알림을 밀어 준다", async () => {
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

  it("NOTI-7 PostgreSQL을 거쳐 다른 서버 인스턴스로도 전달한다", async () => {
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

  it("NOTI-8 유효한 액세스 토큰이 있어야 열리고, 토큰이 만료되면 끝난다", async () => {
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

  it("NOTI-9 알림이 가리키는 글이나 댓글을 지우면 알림도 지워진다", async () => {
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
