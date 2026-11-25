import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestApp } from "../../../test/test-app.ts";

const t = createTestApp();
beforeEach(() => t.reset());
afterAll(() => t.close());

/** 워크스페이스 하나와 그 소유자, 그리고 역할을 정해 사람을 더하는 헬퍼다. */
async function setUpWorkspace() {
  const owner = await t.signUp("owner");
  const workspace = await owner.api.workspaces.create({ name: "  Team  " });
  async function join(nickname: string, role: "admin" | "member" = "member") {
    const user = await t.signUp(nickname);
    await owner.api.workspaces.addMember({
      workspaceId: workspace.id,
      email: `${nickname}@example.com`,
    });
    if (role === "admin") {
      await owner.api.workspaces.updateMemberRole({
        workspaceId: workspace.id,
        userId: user.session.user.id,
        role,
      });
    }
    return user;
  }
  return { owner, workspace, join };
}

async function count(table: string, column: string, value: string) {
  const result = await t.db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} = ${value}`,
  );
  return result.rows[0]?.n;
}

describe("워크스페이스", () => {
  it("WS-1 만든 사람이 소유자가 되고, 목록에 그 역할로 나온다", async () => {
    const { owner, workspace } = await setUpWorkspace();

    expect(workspace).toMatchObject({ name: "Team", role: "owner" });
    expect((await owner.api.workspaces.list()).items).toEqual([workspace]);
    const detail = await owner.api.workspaces.get({ id: workspace.id });
    expect(detail).toMatchObject({ id: workspace.id, name: "Team", myRole: "owner" });
    expect(detail.members.map((m) => [m.user.nickname, m.role])).toEqual([["owner", "owner"]]);

    const stranger = await t.signUp("stranger");
    expect((await stranger.api.workspaces.list()).items).toEqual([]);
  });

  it("WS-2 멤버가 아니면 워크스페이스, 그 글 목록, 그 글이 보이지 않는다", async () => {
    const { owner, workspace } = await setUpWorkspace();
    const { id } = await owner.api.posts.create({
      title: "Secret",
      body: "Plans",
      workspaceId: workspace.id,
    });
    const stranger = await t.signUp("stranger");
    const anonymous = t.client({ kind: "native" });

    for (const api of [stranger.api, anonymous]) {
      await expect(api.workspaces.get({ id: workspace.id })).rejects.toMatchObject({
        code: expect.stringMatching(/NOT_FOUND|UNAUTHORIZED/),
      });
      await expect(api.posts.list({ workspaceId: workspace.id })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(api.posts.get({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await expect(stranger.api.workspaces.get({ id: workspace.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(stranger.api.workspaces.get({ id: randomUUID() })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("WS-3 소유자와 관리자가 이미 있는 계정을 멤버로 더한다", async () => {
    const { owner, workspace, join } = await setUpWorkspace();
    const admin = await join("admin", "admin");
    const member = await join("member");
    const bob = await t.signUp("bob");
    await t.signUp("carol");

    const added = await admin.api.workspaces.addMember({
      workspaceId: workspace.id,
      email: "BOB@example.com",
    });
    expect(added).toMatchObject({
      user: { id: bob.session.user.id, nickname: "bob" },
      role: "member",
    });
    expect((await bob.api.workspaces.list()).items).toMatchObject([
      { id: workspace.id, role: "member" },
    ]);

    await expect(
      owner.api.workspaces.addMember({ workspaceId: workspace.id, email: "nobody@example.com" }),
    ).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
    await expect(
      owner.api.workspaces.addMember({ workspaceId: workspace.id, email: "bob@example.com" }),
    ).rejects.toMatchObject({ code: "ALREADY_MEMBER" });
    await expect(
      member.api.workspaces.addMember({ workspaceId: workspace.id, email: "carol@example.com" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("WS-4 소유자만 역할을 바꾸고, 소유자의 역할은 바꿀 수 없다", async () => {
    const { owner, workspace, join } = await setUpWorkspace();
    const member = await join("member");
    const admin = await join("admin", "admin");
    const ref = { workspaceId: workspace.id, userId: member.session.user.id };

    expect(await owner.api.workspaces.updateMemberRole({ ...ref, role: "admin" })).toMatchObject({
      role: "admin",
    });
    expect(await owner.api.workspaces.updateMemberRole({ ...ref, role: "member" })).toMatchObject({
      role: "member",
    });

    await expect(
      admin.api.workspaces.updateMemberRole({ ...ref, role: "admin" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const ownerRef = { workspaceId: workspace.id, userId: owner.session.user.id };
    for (const api of [owner.api, admin.api]) {
      await expect(
        api.workspaces.updateMemberRole({ ...ownerRef, role: "admin" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    const detail = await owner.api.workspaces.get({ id: workspace.id });
    expect(detail.members.map((m) => [m.user.nickname, m.role])).toEqual([
      ["owner", "owner"],
      ["admin", "admin"],
      ["member", "member"],
    ]);
  });

  it("WS-5 관리자는 멤버를 내보내지만 다른 관리자나 소유자는 내보내지 못한다", async () => {
    const { owner, workspace, join } = await setUpWorkspace();
    const admin = await join("admin", "admin");
    const otherAdmin = await join("admin2", "admin");
    const member = await join("member");
    const remove = (userId: string) =>
      admin.api.workspaces.removeMember({ workspaceId: workspace.id, userId });

    await remove(member.session.user.id);
    expect((await member.api.workspaces.list()).items).toEqual([]);
    await expect(remove(otherAdmin.session.user.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(remove(owner.session.user.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    // 소유자는 관리자를 내보낼 수 있다.
    await owner.api.workspaces.removeMember({
      workspaceId: workspace.id,
      userId: otherAdmin.session.user.id,
    });
    expect((await otherAdmin.api.workspaces.list()).items).toEqual([]);
  });

  it("WS-6 멤버는 나갈 수 있지만 소유자는 나가지 못한다", async () => {
    const { owner, workspace, join } = await setUpWorkspace();
    const member = await join("member");

    await member.api.workspaces.removeMember({
      workspaceId: workspace.id,
      userId: member.session.user.id,
    });
    expect((await member.api.workspaces.list()).items).toEqual([]);
    await expect(
      owner.api.workspaces.removeMember({
        workspaceId: workspace.id,
        userId: owner.session.user.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("WS-7 멤버를 내보내는 즉시 워크스페이스 글에 접근할 수 없다", async () => {
    const { owner, workspace, join } = await setUpWorkspace();
    const member = await join("member");
    const { id } = await member.api.posts.create({
      title: "Mine",
      body: "Written while a member",
      workspaceId: workspace.id,
    });
    expect((await member.api.posts.get({ id })).title).toBe("Mine");

    await owner.api.workspaces.removeMember({
      workspaceId: workspace.id,
      userId: member.session.user.id,
    });

    await expect(member.api.posts.get({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      member.api.posts.update({ id, title: "Edited", body: "after removal" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(member.api.posts.delete({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // 규칙 8: 그 사람이 쓴 글은 워크스페이스에 남는다.
    expect((await owner.api.posts.get({ id })).author.nickname).toBe("member");
  });

  it("WS-8 워크스페이스 글은 워크스페이스 게시판에만 있고 공개 게시판에는 없다", async () => {
    const { workspace, join } = await setUpWorkspace();
    const member = await join("member");
    const { id } = await member.api.posts.create({
      title: "Internal",
      body: "Body",
      workspaceId: workspace.id,
    });
    const { id: publicId } = await member.api.posts.create({ title: "Public", body: "Body" });

    const board = await member.api.posts.list({ workspaceId: workspace.id });
    expect(board.items.map((p) => [p.id, p.workspaceId])).toEqual([[id, workspace.id]]);
    const publicBoard = await t.client({ kind: "native" }).posts.list({});
    expect(publicBoard.items.map((p) => [p.id, p.workspaceId])).toEqual([[publicId, null]]);
    expect((await member.api.posts.get({ id })).workspaceId).toBe(workspace.id);

    // 멤버에게 빈 게시판은 NOT_FOUND가 아니라 빈 목록이다.
    const empty = await member.api.workspaces.create({ name: "Empty" });
    expect(await member.api.posts.list({ workspaceId: empty.id })).toEqual({
      items: [],
      nextCursor: null,
    });
    const stranger = await t.signUp("stranger");
    await expect(
      stranger.api.posts.create({ title: "Hi", body: "B", workspaceId: workspace.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("WS-8 커서로 워크스페이스 게시판의 페이지를 넘긴다", async () => {
    const { owner, workspace } = await setUpWorkspace();
    for (const title of ["one", "two", "three"]) {
      await owner.api.posts.create({ title, body: "b", workspaceId: workspace.id });
    }
    const first = await owner.api.posts.list({ workspaceId: workspace.id, limit: 2 });
    const second = await owner.api.posts.list({
      workspaceId: workspace.id,
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect([...first.items, ...second.items].map((p) => p.title)).toEqual(["three", "two", "one"]);
    expect(second.nextCursor).toBeNull();
  });

  it("WS-9 관리자와 소유자는 워크스페이스에서 다른 사람의 글과 댓글을 지울 수 있다", async () => {
    const { owner, workspace, join } = await setUpWorkspace();
    const admin = await join("admin", "admin");
    const member = await join("member");
    const other = await join("other");
    const { id: postId } = await member.api.posts.create({
      title: "Off topic",
      body: "Body",
      workspaceId: workspace.id,
    });
    const comment = await member.api.comments.create({ postId, body: "spam" });

    await expect(other.api.comments.delete({ id: comment.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(other.api.posts.delete({ id: postId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await admin.api.comments.delete({ id: comment.id });
    await admin.api.posts.delete({ id: postId });
    await expect(owner.api.posts.get({ id: postId })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // 소유자도 모더레이션한다.
    const { id: second } = await admin.api.posts.create({
      title: "By admin",
      body: "Body",
      workspaceId: workspace.id,
    });
    await owner.api.posts.delete({ id: second });

    // 수정은 소유자라도 할 수 없고 작성자만 한다.
    const { id: third } = await member.api.posts.create({
      title: "Mine",
      body: "Body",
      workspaceId: workspace.id,
    });
    await expect(
      owner.api.posts.update({ id: third, title: "Edited", body: "by owner" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("WS-9 공개 게시판에서는 작성자만 지울 수 있다", async () => {
    const { owner, workspace } = await setUpWorkspace();
    const writer = await t.signUp("writer");
    const { id } = await writer.api.posts.create({ title: "Public", body: "Body" });
    const comment = await writer.api.comments.create({ postId: id, body: "public comment" });
    expect(workspace.role).toBe("owner");

    await expect(owner.api.comments.delete({ id: comment.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(owner.api.posts.delete({ id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("WS-10 소유자만 워크스페이스를 지울 수 있고, 안의 모든 것이 함께 지워진다", async () => {
    const { owner, workspace, join } = await setUpWorkspace();
    const admin = await join("admin", "admin");
    const member = await join("member");
    const { id: postId } = await member.api.posts.create({
      title: "Post",
      body: "Body",
      workspaceId: workspace.id,
    });
    await admin.api.comments.create({ postId, body: "comment" });
    await admin.api.posts.like({ id: postId });

    for (const api of [admin.api, member.api]) {
      await expect(api.workspaces.delete({ id: workspace.id })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    const stranger = await t.signUp("stranger");
    await expect(stranger.api.workspaces.delete({ id: workspace.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await owner.api.workspaces.delete({ id: workspace.id });

    expect(await count("workspaces", "id", workspace.id)).toBe(0);
    expect(await count("workspace_members", "workspace_id", workspace.id)).toBe(0);
    expect(await count("posts", "id", postId)).toBe(0);
    expect(await count("comments", "post_id", postId)).toBe(0);
    expect(await count("post_likes", "post_id", postId)).toBe(0);
    expect(await count("notifications", "post_id", postId)).toBe(0);
  });

  it("WS-11 멤버가 아닌 사람의 댓글과 좋아요를 NOT_FOUND로 거부한다", async () => {
    const { owner, workspace } = await setUpWorkspace();
    const { id } = await owner.api.posts.create({
      title: "Post",
      body: "Body",
      workspaceId: workspace.id,
    });
    const stranger = await t.signUp("stranger");

    await expect(stranger.api.comments.create({ postId: id, body: "hi" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(stranger.api.posts.like({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stranger.api.posts.unlike({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const detail = await owner.api.posts.get({ id });
    expect(detail).toMatchObject({ likeCount: 0, comments: [] });
  });
});
