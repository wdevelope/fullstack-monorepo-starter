import {
  canRemoveMember,
  WORKSPACE_NAME_MAX,
  workspacePermissions,
  type User,
  type WorkspaceRole,
} from "@starter/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Alert, Button, ErrorNotice, Muted, TextField } from "../../components/ui.tsx";
import { errorMessage, fieldErrors } from "../../lib/errors.ts";
import type { Navigate } from "../../lib/navigation.ts";
import { orpc } from "../../lib/orpc.ts";
import { PostList } from "../posts/PostListScreen.tsx";

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

export function WorkspaceListScreen({ navigate }: { navigate: Navigate }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const workspaces = useQuery(orpc.workspaces.list.queryOptions());
  const create = useMutation(
    orpc.workspaces.create.mutationOptions({
      onSuccess: (workspace) => {
        setName("");
        void queryClient.invalidateQueries({ queryKey: orpc.workspaces.key() });
        navigate({ name: "workspace", id: workspace.id });
      },
    }),
  );

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
      <Muted>Private boards for teams. Only members can see a workspace and its posts.</Muted>
      <form
        noValidate
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ name });
        }}
      >
        <div className="flex-1">
          <TextField
            label="New workspace"
            maxLength={WORKSPACE_NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fieldErrors(create.error).name}
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          Create
        </Button>
      </form>
      {create.error && <Alert>{errorMessage(create.error)}</Alert>}

      {workspaces.isPending && <Muted>Loading…</Muted>}
      {workspaces.isError && (
        <ErrorNotice
          message={errorMessage(workspaces.error)}
          onRetry={() => void workspaces.refetch()}
        />
      )}
      {workspaces.data?.items.length === 0 && <Muted>You are not in any workspace yet.</Muted>}
      <ul className="flex flex-col gap-2">
        {workspaces.data?.items.map((workspace) => (
          <li key={workspace.id}>
            <button
              type="button"
              onClick={() => navigate({ name: "workspace", id: workspace.id })}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 text-left hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
            >
              <span className="font-semibold">{workspace.name}</span>
              <RoleBadge role={workspace.role} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WorkspaceScreen({ id, navigate }: { id: string; navigate: Navigate }) {
  const workspace = useQuery(orpc.workspaces.get.queryOptions({ input: { id } }));
  const back = (
    <Button
      variant="ghost"
      className="-ml-3 self-start"
      onClick={() => navigate({ name: "workspaces" })}
    >
      ← Workspaces
    </Button>
  );

  if (workspace.isPending) return <Muted>Loading…</Muted>;
  if (workspace.isError) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorNotice message={errorMessage(workspace.error)} />
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{workspace.data.name}</h1>
          <RoleBadge role={workspace.data.myRole} />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate({ name: "workspace-members", id })}>
            Members ({workspace.data.members.length})
          </Button>
          <Button onClick={() => navigate({ name: "new-post", workspaceId: id })}>New post</Button>
        </div>
      </div>
      <PostList workspaceId={id} navigate={navigate} />
    </section>
  );
}

export function WorkspaceMembersScreen({
  id,
  user,
  navigate,
}: {
  id: string;
  user: User | null;
  navigate: Navigate;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const detailKey = orpc.workspaces.get.queryKey({ input: { id } });
  const workspace = useQuery(orpc.workspaces.get.queryOptions({ input: { id } }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.workspaces.key() });
  const leave = () => {
    queryClient.removeQueries({ queryKey: detailKey });
    void queryClient.invalidateQueries({ queryKey: orpc.workspaces.list.key() });
    navigate({ name: "workspaces" });
  };

  const add = useMutation(
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
  const remove = useMutation(
    orpc.workspaces.removeMember.mutationOptions({
      onSuccess: async (_, input) => {
        if (input.userId === user?.id) leave();
        else await refresh();
      },
    }),
  );
  const destroy = useMutation(orpc.workspaces.delete.mutationOptions({ onSuccess: leave }));

  if (workspace.isPending) return <Muted>Loading…</Muted>;
  if (workspace.isError) return <ErrorNotice message={errorMessage(workspace.error)} />;
  const data = workspace.data;
  const can = workspacePermissions(data.myRole);
  const error = add.error ?? updateRole.error ?? remove.error ?? destroy.error;

  return (
    <section className="flex flex-col gap-6">
      <Button
        variant="ghost"
        className="-ml-3 self-start"
        onClick={() => navigate({ name: "workspace", id })}
      >
        ← {data.name}
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
      {error && <Alert>{errorMessage(error)}</Alert>}

      {can.addMembers && (
        <form
          noValidate
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate({ workspaceId: id, email });
          }}
        >
          <div className="flex-1">
            <TextField
              label="Add by email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={fieldErrors(add.error).email}
            />
          </div>
          <Button type="submit" disabled={add.isPending}>
            Add
          </Button>
        </form>
      )}

      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {data.members.map((member) => {
          const isSelf = member.user.id === user?.id;
          return (
            <li key={member.user.id} className="flex items-center justify-between gap-2 py-3">
              <span className="font-medium">
                {member.user.nickname}
                {isSelf && <span className="text-zinc-500"> (you)</span>}
              </span>
              <span className="flex items-center gap-2">
                {can.changeRoles && member.role !== "owner" ? (
                  <select
                    aria-label={`Role of ${member.user.nickname}`}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    value={member.role}
                    disabled={updateRole.isPending}
                    onChange={(event) =>
                      updateRole.mutate({
                        workspaceId: id,
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
                {canRemoveMember(data.myRole, { isSelf, role: member.role }) && (
                  <Button
                    variant="danger"
                    disabled={remove.isPending}
                    onClick={() => {
                      const question = isSelf
                        ? `Leave ${data.name}?`
                        : `Remove ${member.user.nickname} from ${data.name}?`;
                      if (window.confirm(question)) {
                        remove.mutate({ workspaceId: id, userId: member.user.id });
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
        <div className="flex items-center justify-between gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <Muted>Deleting the workspace deletes its posts, comments and likes for everyone.</Muted>
          <Button
            variant="danger"
            className="shrink-0"
            disabled={destroy.isPending}
            onClick={() => {
              if (window.confirm(`Delete ${data.name} and everything in it?`)) {
                destroy.mutate({ id });
              }
            }}
          >
            Delete workspace
          </Button>
        </div>
      )}
    </section>
  );
}
