import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestApp } from "../../../test/test-app.ts";

const t = createTestApp();
beforeEach(() => t.reset());
afterAll(() => t.close());

describe("comments", () => {
  it("COM-9 adds a comment for a signed-in user and rejects missing posts", async () => {
    const { api, session } = await t.signUp("writer");
    const { id: postId } = await api.posts.create({ title: "Post", body: "Body" });

    const comment = await api.comments.create({ postId, body: "  Nice post  " });
    expect(comment).toMatchObject({
      body: "Nice post",
      author: { id: session.user.id, nickname: "writer" },
    });

    await expect(
      t.client({ kind: "native" }).comments.create({ postId, body: "anonymous" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      api.comments.create({ postId: randomUUID(), body: "orphan" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("COM-10 lets only the comment author delete it", async () => {
    const author = await t.signUp();
    const other = await t.signUp();
    const { id: postId } = await author.api.posts.create({ title: "Post", body: "Body" });
    const comment = await author.api.comments.create({ postId, body: "mine" });

    await expect(other.api.comments.delete({ id: comment.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await author.api.comments.delete({ id: comment.id });
    await expect(author.api.comments.delete({ id: comment.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await author.api.posts.get({ id: postId })).comments).toEqual([]);
  });
});
