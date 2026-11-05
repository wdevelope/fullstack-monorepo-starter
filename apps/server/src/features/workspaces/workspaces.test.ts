import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestApp } from "../../../test/test-app.ts";

const t = createTestApp();
beforeEach(() => t.reset());
afterAll(() => t.close());

/** An owner with a workspace, plus helpers to add people to it with a role. */
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

describe("workspaces", () => {
  it("WS-1 makes the creator the owner and lists the workspace with that role", async () => {
    const { owner, workspace } = await setUpWorkspace();

    expect(workspace).toMatchObject({ name: "Team", role: "owner" });
    expect((await owner.api.workspaces.list()).items).toEqual([workspace]);
    const detail = await owner.api.workspaces.get({ id: workspace.id });
    expect(detail).toMatchObject({ id: workspace.id, name: "Team", myRole: "owner" });
    expect(detail.members.map((m) => [m.user.nickname, m.role])).toEqual([["owner", "owner"]]);

    const stranger = await t.signUp("stranger");
    expect((await stranger.api.workspaces.list()).items).toEqual([]);
  });

  it("WS-2 hides the workspace, its post list and its posts from non-members", async () => {
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

  it("WS-3 lets the owner and admins add existing accounts as members", async () => {
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

  it("WS-4 lets only the owner change roles, and never the owner's", async () => {
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

  it("WS-5 lets an admin remove members but not other admins or the owner", async () => {
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

    // The owner can remove an admin.
    await owner.api.workspaces.removeMember({
      workspaceId: workspace.id,
      userId: otherAdmin.session.user.id,
    });
    expect((await otherAdmin.api.workspaces.list()).items).toEqual([]);
  });

  it("WS-6 lets a member leave but not the owner", async () => {
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

  it("WS-7 ends access to workspace posts as soon as a member is removed", async () => {
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
    // Rule 8: their post stays in the workspace.
    expect((await owner.api.posts.get({ id })).author.nickname).toBe("member");
  });

  it("WS-8 keeps workspace posts on the workspace board and off the public one", async () => {
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

    // An empty board is an empty list for a member, not NOT_FOUND.
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

  it("WS-8 pages through a workspace board with a cursor", async () => {
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

  it("WS-9 lets admins and the owner delete others' posts and comments in the workspace", async () => {
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

    // The owner moderates too.
    const { id: second } = await admin.api.posts.create({
      title: "By admin",
      body: "Body",
      workspaceId: workspace.id,
    });
    await owner.api.posts.delete({ id: second });

    // Editing stays author-only, even for the owner.
    const { id: third } = await member.api.posts.create({
      title: "Mine",
      body: "Body",
      workspaceId: workspace.id,
    });
    await expect(
      owner.api.posts.update({ id: third, title: "Edited", body: "by owner" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("WS-9 keeps the public board author-only for deletes", async () => {
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

  it("WS-10 lets only the owner delete the workspace, with everything in it", async () => {
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

  it("WS-11 refuses comments and likes from non-members as NOT_FOUND", async () => {
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
