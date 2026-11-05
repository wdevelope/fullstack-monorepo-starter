import { base, requireUser } from "../../platform/context.ts";
import {
  addMember,
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listWorkspaces,
  removeMember,
  updateMemberRole,
  type Result,
} from "./workspaces.service.ts";

type Failure = Extract<Result<unknown>, { ok: false }>["error"];

/** Turns a service result into the value or the matching typed error. */
function unwrap<T>(result: Result<T>, errors: Partial<Record<Failure, () => Error>>): T {
  if (result.ok) return result.value;
  const make = errors[result.error];
  if (!make) throw new Error(`Unexpected workspace error ${result.error}`);
  throw make();
}

export const workspacesRouter = {
  create: base.workspaces.create.use(requireUser).handler(async ({ input, context }) => {
    return createWorkspace(context.db, context.userId, input.name);
  }),

  list: base.workspaces.list.use(requireUser).handler(async ({ context }) => {
    return { items: await listWorkspaces(context.db, context.userId) };
  }),

  get: base.workspaces.get.use(requireUser).handler(async ({ input, context, errors }) => {
    const workspace = await getWorkspace(context.db, input.id, context.userId);
    if (!workspace) throw errors.NOT_FOUND();
    return workspace;
  }),

  addMember: base.workspaces.addMember
    .use(requireUser)
    .handler(async ({ input, context, errors }) => {
      return unwrap(
        await addMember(context.db, input.workspaceId, context.userId, input.email),
        errors,
      );
    }),

  updateMemberRole: base.workspaces.updateMemberRole
    .use(requireUser)
    .handler(async ({ input, context, errors }) => {
      return unwrap(await updateMemberRole(context.db, input, context.userId), errors);
    }),

  removeMember: base.workspaces.removeMember
    .use(requireUser)
    .handler(async ({ input, context, errors }) => {
      unwrap(await removeMember(context.db, input, context.userId), errors);
      return {};
    }),

  delete: base.workspaces.delete.use(requireUser).handler(async ({ input, context, errors }) => {
    unwrap(await deleteWorkspace(context.db, input.id, context.userId), errors);
    return {};
  }),
};
