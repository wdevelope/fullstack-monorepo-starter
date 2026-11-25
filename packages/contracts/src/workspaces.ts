import { oc } from "@orpc/contract";
import * as z from "zod";

import { emailSchema } from "./auth.ts";

export const WORKSPACE_NAME_MAX = 50;

export const workspaceRoleSchema = z.enum(["owner", "admin", "member"]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/** 소유자가 줄 수 있는 역할이다. 소유권은 넘어가지 않는다. */
export const assignableRoleSchema = z.enum(["admin", "member"]);

export const workspaceNameSchema = z.string().trim().min(1).max(WORKSPACE_NAME_MAX);

export const workspaceSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** 이 워크스페이스에서 호출자의 역할이다. */
  role: workspaceRoleSchema,
  createdAt: z.date(),
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const workspaceMemberSchema = z.object({
  user: z.object({ id: z.uuid(), nickname: z.string() }),
  role: workspaceRoleSchema,
  joinedAt: z.date(),
});
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;

export const workspaceDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.date(),
  /** 이 워크스페이스에서 호출자의 역할이다. */
  myRole: workspaceRoleSchema,
  /** 소유자, 관리자, 멤버 순이고, 같은 역할 안에서는 오래된 순이다. */
  members: z.array(workspaceMemberSchema),
});
export type WorkspaceDetail = z.infer<typeof workspaceDetailSchema>;

const memberRef = z.object({ workspaceId: z.uuid(), userId: z.uuid() });

// 멤버가 아니면 FORBIDDEN이 아니라 NOT_FOUND를 받는다. 그래서 워크스페이스가 있는지 드러나지 않는다(WS 규칙 4).
const NOT_FOUND = { status: 404, message: "요청한 내용을 찾을 수 없어요." } as const;
const FORBIDDEN = {
  status: 403,
  message: "이 워크스페이스에서 맡은 역할로는 할 수 없어요.",
} as const;

export const workspacesContract = {
  create: oc.input(z.object({ name: workspaceNameSchema })).output(workspaceSummarySchema),

  list: oc.output(z.object({ items: z.array(workspaceSummarySchema) })),

  get: oc
    .input(z.object({ id: z.uuid() }))
    .output(workspaceDetailSchema)
    .errors({ NOT_FOUND }),

  addMember: oc
    .input(z.object({ workspaceId: z.uuid(), email: emailSchema }))
    .output(workspaceMemberSchema)
    .errors({
      NOT_FOUND,
      FORBIDDEN,
      USER_NOT_FOUND: { status: 404, message: "해당 이메일로 가입한 사용자가 없어요." },
      ALREADY_MEMBER: { status: 409, message: "이미 워크스페이스 멤버예요." },
    }),

  updateMemberRole: oc
    .input(memberRef.extend({ role: assignableRoleSchema }))
    .output(workspaceMemberSchema)
    .errors({ NOT_FOUND, FORBIDDEN }),

  /** 자신을 내보내면 나가기다. 소유자는 나갈 수 없다. */
  removeMember: oc.input(memberRef).output(z.object({})).errors({ NOT_FOUND, FORBIDDEN }),

  delete: oc
    .input(z.object({ id: z.uuid() }))
    .output(z.object({}))
    .errors({ NOT_FOUND, FORBIDDEN }),
};

/**
 * 호출자의 역할에 따라 보여 줄 워크스페이스 조작이다. 서버 규칙(WS 규칙 2, 6, 8)과 같다.
 * 클라이언트는 버튼을 숨기는 데 쓰고, 모든 요청의 판단은 여전히 서버가 한다.
 */
export function workspacePermissions(myRole: WorkspaceRole) {
  return {
    addMembers: myRole !== "member",
    changeRoles: myRole === "owner",
    moderate: myRole !== "member",
    deleteWorkspace: myRole === "owner",
  };
}

/** 호출자가 `target`을 내보낼 수 있는지 돌려준다. 자신을 내보내면 나가기이고, 소유자는 나가지 않는다. */
export function canRemoveMember(
  myRole: WorkspaceRole,
  target: { isSelf: boolean; role: WorkspaceRole },
): boolean {
  if (target.role === "owner") return false;
  if (target.isSelf) return true;
  return myRole === "owner" || (myRole === "admin" && target.role === "member");
}
