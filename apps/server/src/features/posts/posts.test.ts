import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestApp } from "../../../test/test-app.ts";
import { comments, postLikes, posts } from "../../db/schema.ts";

const t = createTestApp();
beforeEach(() => t.reset());
afterAll(() => t.close());

const anonymous = () => t.client({ kind: "native" });

describe("글 목록", () => {
  /** 기대하는 순서가 실행 시점에 좌우되지 않도록 글을 1분 간격으로 넣는다. */
  async function seedPosts(authorId: string, count: number) {
    const start = Date.UTC(2026, 0, 1);
    const rows = Array.from({ length: count }, (_, i) => ({
      authorId,
      title: `Post ${i + 1}`,
      body: `Body ${i + 1}`,
      createdAt: new Date(start + i * 60_000),
    }));
    await t.db.insert(posts).values(rows);
  }

  it("COM-1 nextCursor가 null이 될 때까지 최신순으로 페이지를 넘긴다", async () => {
    const { session } = await t.signUp();
    await seedPosts(session.user.id, 5);

    const titles: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const result = await anonymous().posts.list({ limit: 2, cursor });
      titles.push(...result.items.map((item) => item.title));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }

    expect(titles).toEqual(["Post 5", "Post 4", "Post 3", "Post 2", "Post 1"]);
  });

  it("COM-1 요청 사이에 새 글이 들어와도 다음 페이지가 밀리지 않는다", async () => {
    const { session, api } = await t.signUp();
    await seedPosts(session.user.id, 3);

    const first = await anonymous().posts.list({ limit: 2 });
    await api.posts.create({ title: "Brand new", body: "Arrived late" });
    const second = await anonymous().posts.list({ limit: 2, cursor: first.nextCursor! });

    expect(first.items.map((p) => p.title)).toEqual(["Post 3", "Post 2"]);
    expect(second.items.map((p) => p.title)).toEqual(["Post 1"]);
    expect(second.nextCursor).toBeNull();
  });

  it("COM-2 형식이 틀린 커서를 거부한다", async () => {
    for (const cursor of ["not-base64-json", Buffer.from('["x","y"]').toString("base64url")]) {
      await expect(anonymous().posts.list({ cursor })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  });

  it("COM-11 본문 발췌, 댓글 수, 좋아요 수를 담는다", async () => {
    const { api } = await t.signUp();
    const other = await t.signUp();
    const { id } = await api.posts.create({ title: "Counts", body: "x".repeat(500) });
    await api.comments.create({ postId: id, body: "first" });
    await other.api.comments.create({ postId: id, body: "second" });
    await other.api.posts.like({ id });

    const { items } = await anonymous().posts.list({});
    expect(items[0]).toMatchObject({
      id,
      excerpt: "x".repeat(140),
      commentCount: 2,
      likeCount: 1,
    });
  });
});

describe("글 읽기", () => {
  it("COM-3 본문, 오래된 순 댓글, 호출자의 likedByMe를 돌려준다", async () => {
    const author = await t.signUp("author");
    const reader = await t.signUp("reader");
    const { id } = await author.api.posts.create({ title: "Hello", body: "World" });
    await reader.api.comments.create({ postId: id, body: "first" });
    await author.api.comments.create({ postId: id, body: "second" });
    await reader.api.posts.like({ id });

    const forReader = await reader.api.posts.get({ id });
    expect(forReader).toMatchObject({
      title: "Hello",
      body: "World",
      author: { nickname: "author" },
      likeCount: 1,
      likedByMe: true,
    });
    expect(forReader.comments.map((c) => [c.body, c.author.nickname])).toEqual([
      ["first", "reader"],
      ["second", "author"],
    ]);

    expect((await author.api.posts.get({ id })).likedByMe).toBe(false);
    expect((await anonymous().posts.get({ id })).likedByMe).toBe(false);
  });

  it("COM-4 없는 글이면 NOT_FOUND를 돌려준다", async () => {
    await expect(anonymous().posts.get({ id: randomUUID() })).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});

describe("글쓰기", () => {
  it("COM-5 로그인이 필요하고, 앞뒤 공백을 지운 텍스트를 저장한다", async () => {
    await expect(anonymous().posts.create({ title: "Hi", body: "There" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    const { api } = await t.signUp();
    const { id } = await api.posts.create({ title: "  Hi  ", body: "  There \n" });
    expect(await api.posts.get({ id })).toMatchObject({ title: "Hi", body: "There" });

    await expect(api.posts.create({ title: "   ", body: "x" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("COM-6 작성자만 고치거나 지울 수 있고, 없는 글은 NOT_FOUND로 알린다", async () => {
    const author = await t.signUp();
    const other = await t.signUp();
    const { id } = await author.api.posts.create({ title: "Mine", body: "Body" });

    await expect(
      other.api.posts.update({ id, title: "Hijacked", body: "Body" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(other.api.posts.delete({ id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      author.api.posts.update({ id: randomUUID(), title: "x", body: "y" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await author.api.posts.update({ id, title: "Edited", body: "Body" });
    expect((await anonymous().posts.get({ id })).title).toBe("Edited");
  });

  it("COM-7 글을 지우면 댓글과 좋아요도 사라진다", async () => {
    const { api } = await t.signUp();
    const { id } = await api.posts.create({ title: "Short-lived", body: "Body" });
    await api.comments.create({ postId: id, body: "comment" });
    await api.posts.like({ id });

    await api.posts.delete({ id });

    await expect(anonymous().posts.get({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await t.db.select().from(comments)).toEqual([]);
    expect(await t.db.select().from(postLikes)).toEqual([]);
  });
});

describe("좋아요", () => {
  it("COM-8 좋아요와 좋아요 취소를 두 번 해도 두 번째는 아무것도 바꾸지 않는다", async () => {
    const { api } = await t.signUp();
    const other = await t.signUp();
    const { id } = await api.posts.create({ title: "Likeable", body: "Body" });

    expect(await api.posts.like({ id })).toEqual({ likeCount: 1, likedByMe: true });
    expect(await api.posts.like({ id })).toEqual({ likeCount: 1, likedByMe: true });
    expect(await other.api.posts.like({ id })).toEqual({ likeCount: 2, likedByMe: true });
    expect(await api.posts.unlike({ id })).toEqual({ likeCount: 1, likedByMe: false });
    expect(await api.posts.unlike({ id })).toEqual({ likeCount: 1, likedByMe: false });

    await expect(api.posts.like({ id: randomUUID() })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
