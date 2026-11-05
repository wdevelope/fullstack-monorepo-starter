import {
  canRemoveMember,
  emailSchema,
  WORKSPACE_NAME_MAX,
  workspaceNameSchema,
  workspacePermissions,
  type WorkspaceRole,
} from "@starter/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Button, Card, ErrorBanner, TextInput } from "../components/ui.tsx";
import { orpc, queryClient, useUser } from "../lib/api.ts";
import { describeError } from "../lib/errors.ts";
import { PostList } from "./post-list.tsx";

const roleLabel: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

function RoleBadge({ role }: { role: WorkspaceRole }) {
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {roleLabel[role]}
    </span>
  );
}

export function WorkspaceListPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const workspaces = useQuery(orpc.workspaces.list.queryOptions());
  const create = useMutation(
    orpc.workspaces.create.mutationOptions({
      onSuccess: async (workspace) => {
        setName("");
        await queryClient.invalidateQueries({ queryKey: orpc.workspaces.key() });
        await navigate({ to: "/workspaces/$workspaceId", params: { workspaceId: workspace.id } });
      },
    }),
  );
  const parsed = workspaceNameSchema.safeParse(name);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (parsed.success) create.mutate({ name: parsed.data });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Workspaces</h1>
      <p className="text-sm text-zinc-500">
        Private boards for teams. Only members can see a workspace and its posts.
      </p>

      <Card>
        <form onSubmit={submit} className="flex gap-2">
          <TextInput
            aria-label="Workspace name"
            placeholder="New workspace name"
            maxLength={WORKSPACE_NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" disabled={!parsed.success || create.isPending}>
            Create
          </Button>
        </form>
        <div className="mt-3">
          <ErrorBanner message={create.error ? describeError(create.error) : null} />
        </div>
      </Card>

      <ErrorBanner message={workspaces.error ? describeError(workspaces.error) : null} />
      {workspaces.isPending && <p className="text-sm text-zinc-500">Loading…</p>}
      {workspaces.data?.items.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          You are not in any workspace yet. Create one, or ask an admin to add you.
        </p>
      )}
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {workspaces.data?.items.map((workspace) => (
          <li key={workspace.id}>
            <Link
              to="/workspaces/$workspaceId"
              params={{ workspaceId: workspace.id }}
              className="flex items-center justify-between px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <span className="font-medium">{workspace.name}</span>
              <RoleBadge role={workspace.role} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const boardRoute = getRouteApi("/workspaces/$workspaceId");

export function WorkspacePage() {
  const { workspaceId } = boardRoute.useParams();
  const workspace = useQuery(orpc.workspaces.get.queryOptions({ input: { id: workspaceId } }));

  if (workspace.isPending) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (workspace.isError) return <ErrorBanner message={describeError(workspace.error)} />;
  const data = workspace.data;

  return (
    <div className="space-y-4">
      <Link to="/workspaces" className="text-sm text-zinc-500 hover:underline">
        ← Workspaces
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <RoleBadge role={data.myRole} />
        </div>
        <div className="flex gap-2">
          <Link to="/workspaces/$workspaceId/members" params={{ workspaceId }}>
            <Button variant="secondary">Members ({data.members.length})</Button>
          </Link>
          <Link to="/posts/new" search={{ workspaceId }}>
            <Button>New post</Button>
          </Link>
        </div>
      </div>
      <PostList workspaceId={workspaceId} />
    </div>
  );
}

const membersRoute = getRouteApi("/workspaces/$workspaceId/members");

export function WorkspaceMembersPage() {
  const { workspaceId } = membersRoute.useParams();
  const user = useUser();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  const detailQuery = orpc.workspaces.get.queryOptions({ input: { id: workspaceId } });
  const workspace = useQuery(detailQuery);
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.workspaces.key() });
  const leaveWorkspace = async () => {
    queryClient.removeQueries({ queryKey: detailQuery.queryKey });
    await queryClient.invalidateQueries({ queryKey: orpc.workspaces.list.key() });
    await navigate({ to: "/workspaces" });
  };

  const addMember = useMutation(
    orpc.workspaces.addMember.mutationOptions({
      onSuccess: async () => {
        setEmail("");
        await refresh();
      },
    }),
  );
  const updateRole = useMutation(
    orpc.workspaces.updateMemberRole.mutationOptions({ onSuccess: refresh }),
  );
  const removeMember = useMutation(
    orpc.workspaces.removeMember.mutationOptions({
      onSuccess: async (_, input) => {
        if (input.userId === user?.id) await leaveWorkspace();
        else await refresh();
      },
    }),
  );
  const deleteWorkspace = useMutation(
    orpc.workspaces.delete.mutationOptions({ onSuccess: leaveWorkspace }),
  );

  if (workspace.isPending) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (workspace.isError) return <ErrorBanner message={describeError(workspace.error)} />;
  const data = workspace.data;
  const can = workspacePermissions(data.myRole);
  const emailOk = emailSchema.safeParse(email).success;
  const error = [addMember, updateRole, removeMember, deleteWorkspace].find((m) => m.error)?.error;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (emailOk) addMember.mutate({ workspaceId, email });
  }

  return (
    <div className="space-y-6">
      <Link
        to="/workspaces/$workspaceId"
        params={{ workspaceId }}
        className="text-sm text-zinc-500 hover:underline"
      >
        ← {data.name}
      </Link>
      <h1 className="text-2xl font-semibold">Members</h1>
      <ErrorBanner message={error ? describeError(error) : null} />

      {can.addMembers && (
        <Card>
          <form onSubmit={submit} className="flex gap-2">
            <TextInput
              type="email"
              aria-label="Email of the person to add"
              placeholder="Add by email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button type="submit" disabled={!emailOk || addMember.isPending}>
              Add
            </Button>
          </form>
        </Card>
      )}

      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {data.members.map((member) => {
          const isSelf = member.user.id === user?.id;
          const removable = canRemoveMember(data.myRole, { isSelf, role: member.role });
          return (
            <li
              key={member.user.id}
              className="flex items-center justify-between gap-2 px-5 py-3"
              data-testid="member-row"
            >
              <span className="font-medium">
                {member.user.nickname}
                {isSelf && <span className="text-zinc-500"> (you)</span>}
              </span>
              <span className="flex items-center gap-2">
                {can.changeRoles && member.role !== "owner" ? (
                  <select
                    aria-label={`Role of ${member.user.nickname}`}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    value={member.role}
                    disabled={updateRole.isPending}
                    onChange={(event) =>
                      updateRole.mutate({
                        workspaceId,
                        userId: member.user.id,
                        role: event.target.value === "admin" ? "admin" : "member",
                      })
                    }
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <RoleBadge role={member.role} />
                )}
                {removable && (
                  <Button
                    variant="danger"
                    disabled={removeMember.isPending}
                    onClick={() => {
                      const question = isSelf
                        ? `Leave ${data.name}?`
                        : `Remove ${member.user.nickname} from ${data.name}?`;
                      if (confirm(question)) {
                        removeMember.mutate({ workspaceId, userId: member.user.id });
                      }
                    }}
                  >
                    {isSelf ? "Leave" : "Remove"}
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {can.deleteWorkspace && (
        <Card>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-zinc-500">
              Deleting the workspace deletes its posts, comments and likes for everyone.
            </p>
            <Button
              variant="danger"
              className="shrink-0 whitespace-nowrap"
              disabled={deleteWorkspace.isPending}
              onClick={() => {
                if (confirm(`Delete ${data.name} and everything in it?`)) {
                  deleteWorkspace.mutate({ id: workspaceId });
                }
              }}
            >
              Delete workspace
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
