import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestApp } from "../../../test/test-app.ts";
import { comments, postLikes, posts } from "../../db/schema.ts";

const t = createTestApp();
beforeEach(() => t.reset());
afterAll(() => t.close());

const anonymous = () => t.client({ kind: "native" });

describe("listing posts", () => {
  /** Inserts posts one minute apart so the expected order does not depend on timing. */
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

  it("COM-1 pages through posts newest first until nextCursor is null", async () => {
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

  it("COM-1 keeps later pages stable when a new post arrives between requests", async () => {
    const { session, api } = await t.signUp();
    await seedPosts(session.user.id, 3);

    const first = await anonymous().posts.list({ limit: 2 });
    await api.posts.create({ title: "Brand new", body: "Arrived late" });
    const second = await anonymous().posts.list({ limit: 2, cursor: first.nextCursor! });

    expect(first.items.map((p) => p.title)).toEqual(["Post 3", "Post 2"]);
    expect(second.items.map((p) => p.title)).toEqual(["Post 1"]);
    expect(second.nextCursor).toBeNull();
  });

  it("COM-2 rejects a malformed cursor", async () => {
    for (const cursor of ["not-base64-json", Buffer.from('["x","y"]').toString("base64url")]) {
      await expect(anonymous().posts.list({ cursor })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  });

  it("COM-11 includes an excerpt and comment and like counts", async () => {
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

describe("reading a post", () => {
  it("COM-3 returns the body, comments oldest first and likedByMe for the caller", async () => {
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

  it("COM-4 returns NOT_FOUND for a post that does not exist", async () => {
    await expect(anonymous().posts.get({ id: randomUUID() })).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});

describe("writing posts", () => {
  it("COM-5 requires sign-in and stores trimmed text", async () => {
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

  it("COM-6 lets only the author edit or delete, and reports missing posts", async () => {
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

  it("COM-7 deleting a post removes its comments and likes", async () => {
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

describe("likes", () => {
  it("COM-8 liking and unliking twice changes nothing the second time", async () => {
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
