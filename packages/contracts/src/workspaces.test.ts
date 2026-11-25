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

describe("워크스페이스 입력", () => {
  it("WS-1 워크스페이스 이름의 앞뒤 공백을 지우고, 비었거나 너무 긴 이름은 거부한다", () => {
    expect(workspaceNameSchema.parse("  Team A ")).toBe("Team A");
    expect(workspaceNameSchema.safeParse("   ").success).toBe(false);
    expect(workspaceNameSchema.safeParse("x".repeat(WORKSPACE_NAME_MAX + 1)).success).toBe(false);
  });

  it("WS-3 더할 멤버의 이메일을 정규화한다", () => {
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

  it("WS-4 새 역할로 admin과 member만 받는다", () => {
    const input = workspacesContract.updateMemberRole["~orpc"].inputSchema;
    const base = {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
    };
    expect(validate(input, { ...base, role: "admin" })).toHaveProperty("value");
    expect(validate(input, { ...base, role: "owner" })).toHaveProperty("issues");
  });

  it("WS-8 워크스페이스에 글을 쓸 수 있다", () => {
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

describe("클라이언트가 보여 주는 워크스페이스 권한", () => {
  it("WS-3 소유자와 관리자는 멤버를 더할 수 있다", () => {
    expect(workspacePermissions("owner").addMembers).toBe(true);
    expect(workspacePermissions("admin").addMembers).toBe(true);
    expect(workspacePermissions("member").addMembers).toBe(false);
  });

  it("WS-4 소유자만 역할을 바꿀 수 있다", () => {
    expect(workspacePermissions("owner").changeRoles).toBe(true);
    expect(workspacePermissions("admin").changeRoles).toBe(false);
  });

  it("WS-5 관리자는 일반 멤버만, 소유자는 자신을 뺀 누구든 내보낼 수 있다", () => {
    expect(canRemoveMember("admin", { isSelf: false, role: "member" })).toBe(true);
    expect(canRemoveMember("admin", { isSelf: false, role: "admin" })).toBe(false);
    expect(canRemoveMember("admin", { isSelf: false, role: "owner" })).toBe(false);
    expect(canRemoveMember("owner", { isSelf: false, role: "admin" })).toBe(true);
    expect(canRemoveMember("member", { isSelf: false, role: "member" })).toBe(false);
  });

  it("WS-6 소유자를 뺀 누구나 나갈 수 있다", () => {
    expect(canRemoveMember("member", { isSelf: true, role: "member" })).toBe(true);
    expect(canRemoveMember("admin", { isSelf: true, role: "admin" })).toBe(true);
    expect(canRemoveMember("owner", { isSelf: true, role: "owner" })).toBe(false);
  });

  it("WS-9 관리자와 소유자는 모더레이션할 수 있고, WS-10 워크스페이스는 소유자만 지울 수 있다", () => {
    expect(workspacePermissions("admin").moderate).toBe(true);
    expect(workspacePermissions("member").moderate).toBe(false);
    expect(workspacePermissions("owner").deleteWorkspace).toBe(true);
    expect(workspacePermissions("admin").deleteWorkspace).toBe(false);
  });
});

describe("알림 입력", () => {
  it("NOTI-5 markRead는 ids가 있어도 없어도 받는다", () => {
    const input = notificationsContract.markRead["~orpc"].inputSchema;
    expect(validate(input, {})).toEqual({ value: {} });
    expect(validate(input, { ids: ["not-a-uuid"] })).toHaveProperty("issues");
  });
});
