import { oc } from "@orpc/contract";
import * as z from "zod";

import { emailSchema } from "./auth.ts";

export const WORKSPACE_NAME_MAX = 50;

export const workspaceRoleSchema = z.enum(["owner", "admin", "member"]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/** Roles the owner can assign. Ownership never moves. */
export const assignableRoleSchema = z.enum(["admin", "member"]);

export const workspaceNameSchema = z.string().trim().min(1).max(WORKSPACE_NAME_MAX);

export const workspaceSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** The caller's role in this workspace. */
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
  /** The caller's role in this workspace. */
  myRole: workspaceRoleSchema,
  /** Owner first, then admins, then members, each oldest first. */
  members: z.array(workspaceMemberSchema),
});
export type WorkspaceDetail = z.infer<typeof workspaceDetailSchema>;

const memberRef = z.object({ workspaceId: z.uuid(), userId: z.uuid() });

// Non-members get NOT_FOUND, never FORBIDDEN, so a workspace's existence is not revealed (WS rule 4).
const NOT_FOUND = { status: 404, message: "Not found." } as const;
const FORBIDDEN = {
  status: 403,
  message: "Your role in this workspace does not allow this.",
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
      USER_NOT_FOUND: { status: 404, message: "No account uses this email." },
      ALREADY_MEMBER: { status: 409, message: "This person is already a member." },
    }),

  updateMemberRole: oc
    .input(memberRef.extend({ role: assignableRoleSchema }))
    .output(workspaceMemberSchema)
    .errors({ NOT_FOUND, FORBIDDEN }),

  /** Removing yourself is leaving. The owner cannot leave. */
  removeMember: oc.input(memberRef).output(z.object({})).errors({ NOT_FOUND, FORBIDDEN }),

  delete: oc
    .input(z.object({ id: z.uuid() }))
    .output(z.object({}))
    .errors({ NOT_FOUND, FORBIDDEN }),
};
