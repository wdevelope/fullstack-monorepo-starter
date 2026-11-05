import { describe, expect, it } from "vitest";

import { postsContract } from "./community.ts";
import { notificationsContract } from "./notifications.ts";
import { WORKSPACE_NAME_MAX, workspaceNameSchema, workspacesContract } from "./workspaces.ts";

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

describe("notification input", () => {
  it("NOTI-5 accepts markRead with or without ids", () => {
    const input = notificationsContract.markRead["~orpc"].inputSchema;
    expect(validate(input, {})).toEqual({ value: {} });
    expect(validate(input, { ids: ["not-a-uuid"] })).toHaveProperty("issues");
  });
});
