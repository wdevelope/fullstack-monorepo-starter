import { describe, expect, it } from "vitest";

import { postsContract } from "./community.ts";
import { notificationsContract } from "./notifications.ts";
import {
  canRemoveMember,
  WORKSPACE_NAME_MAX,
  workspaceNameSchema,
  workspacePermissions,
  workspacesContract,
} from "./workspaces.ts";

function validate(schema: unknown, input: unknown) {
  const standard = schema as { "~standard": { validate(input: unknown): unknown } };
  return standard["~standard"].validate(input) as { value?: unknown; issues?: unknown };
}

describe("workspace input", () => {
  it("WS-1 trims the workspace name and rejects blank or long names", () => {
    expect(workspaceNameSchema.parse("  Team A ")).toBe("Team A");
    expect(workspaceNameSchema.safeParse("   ").success).toBe(false);
    expect(workspaceNameSchema.safeParse("x".repeat(WORKSPACE_NAME_MAX + 1)).success).toBe(false);
  });

  it("WS-3 normalises the email of the member to add", () => {
    const input = workspacesContract.addMember["~orpc"].inputSchema;
    expect(
      validate(input, {
        workspaceId: "00000000-0000-4000-8000-000000000001",
        email: " Bob@Example.com ",
      }),
    ).toEqual({
      value: { workspaceId: "00000000-0000-4000-8000-000000000001", email: "bob@example.com" },
    });
  });

  it("WS-4 only accepts admin or member as a new role", () => {
    const input = workspacesContract.updateMemberRole["~orpc"].inputSchema;
    const base = {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
    };
    expect(validate(input, { ...base, role: "admin" })).toHaveProperty("value");
    expect(validate(input, { ...base, role: "owner" })).toHaveProperty("issues");
  });

  it("WS-8 lets a post be created in a workspace", () => {
    const input = postsContract.create["~orpc"].inputSchema;
    expect(
      validate(input, {
        title: " T ",
        body: "B",
        workspaceId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toEqual({
      value: { title: "T", body: "B", workspaceId: "00000000-0000-4000-8000-000000000001" },
    });
    expect(validate(input, { title: "T", body: "B", workspaceId: "nope" })).toHaveProperty(
      "issues",
    );
  });
});

describe("workspace permissions shown by clients", () => {
  it("WS-3 lets the owner and admins add members", () => {
    expect(workspacePermissions("owner").addMembers).toBe(true);
    expect(workspacePermissions("admin").addMembers).toBe(true);
    expect(workspacePermissions("member").addMembers).toBe(false);
  });

  it("WS-4 lets only the owner change roles", () => {
    expect(workspacePermissions("owner").changeRoles).toBe(true);
    expect(workspacePermissions("admin").changeRoles).toBe(false);
  });

  it("WS-5 lets admins remove members only, and the owner anyone but themselves", () => {
    expect(canRemoveMember("admin", { isSelf: false, role: "member" })).toBe(true);
    expect(canRemoveMember("admin", { isSelf: false, role: "admin" })).toBe(false);
    expect(canRemoveMember("admin", { isSelf: false, role: "owner" })).toBe(false);
    expect(canRemoveMember("owner", { isSelf: false, role: "admin" })).toBe(true);
    expect(canRemoveMember("member", { isSelf: false, role: "member" })).toBe(false);
  });

  it("WS-6 lets everyone but the owner leave", () => {
    expect(canRemoveMember("member", { isSelf: true, role: "member" })).toBe(true);
    expect(canRemoveMember("admin", { isSelf: true, role: "admin" })).toBe(true);
    expect(canRemoveMember("owner", { isSelf: true, role: "owner" })).toBe(false);
  });

  it("WS-9 lets admins and the owner moderate, and WS-10 only the owner delete", () => {
    expect(workspacePermissions("admin").moderate).toBe(true);
    expect(workspacePermissions("member").moderate).toBe(false);
    expect(workspacePermissions("owner").deleteWorkspace).toBe(true);
    expect(workspacePermissions("admin").deleteWorkspace).toBe(false);
  });
});

describe("notification input", () => {
  it("NOTI-5 accepts markRead with or without ids", () => {
    const input = notificationsContract.markRead["~orpc"].inputSchema;
    expect(validate(input, {})).toEqual({ value: {} });
    expect(validate(input, { ids: ["not-a-uuid"] })).toHaveProperty("issues");
  });
});
