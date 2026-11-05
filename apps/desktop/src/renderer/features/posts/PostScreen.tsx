import { ORPCError } from "@orpc/client";
import { workspacePermissions, type User } from "@starter/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, ErrorNotice, Muted } from "../../components/ui.tsx";
import { errorMessage } from "../../lib/errors.ts";
import { formatDate } from "../../lib/format.ts";
import type { Navigate } from "../../lib/navigation.ts";
import { orpc } from "../../lib/orpc.ts";
import { Comments } from "./Comments.tsx";

export function PostScreen({
  id,
  user,
  navigate,
}: {
  id: string;
  user: User | null;
  navigate: Navigate;
}) {
  const queryClient = useQueryClient();
  const postKey = orpc.posts.get.queryKey({ input: { id } });
  const post = useQuery(orpc.posts.get.queryOptions({ input: { id } }));
  const workspaceId = post.data?.workspaceId ?? null;
  // For a workspace post: its name for the back button and the caller's role for moderation.
  const workspace = useQuery({
    ...orpc.workspaces.get.queryOptions({ input: { id: workspaceId ?? "" } }),
    enabled: Boolean(workspaceId && user),
  });
  const canModerate = workspace.data ? workspacePermissions(workspace.data.myRole).moderate : false;

  const applyLikes = (likes: { likeCount: number; likedByMe: boolean }) => {
    queryClient.setQueryData(postKey, (old) => old && { ...old, ...likes });
    void queryClient.invalidateQueries({ queryKey: orpc.posts.list.key() });
  };
  const like = useMutation(orpc.posts.like.mutationOptions({ onSuccess: applyLikes }));
  const unlike = useMutation(orpc.posts.unlike.mutationOptions({ onSuccess: applyLikes }));
  const remove = useMutation(
    orpc.posts.delete.mutationOptions({
      onSuccess: () => {
        queryClient.removeQueries({ queryKey: postKey });
        void queryClient.invalidateQueries({ queryKey: orpc.posts.list.key() });
        navigate(workspaceId ? { name: "workspace", id: workspaceId } : { name: "posts" });
      },
    }),
  );

  const back = (
    <Button
      variant="ghost"
      className="-ml-3 self-start"
      onClick={() =>
        navigate(workspaceId ? { name: "workspace", id: workspaceId } : { name: "posts" })
      }
    >
      ← {workspaceId ? (workspace.data?.name ?? "Workspace") : "All posts"}
    </Button>
  );

  if (post.isPending) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Muted>Loading…</Muted>
      </div>
    );
  }
  if (post.isError) {
    const missing = post.error instanceof ORPCError && post.error.code === "NOT_FOUND";
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorNotice
          message={missing ? "This post does not exist or was deleted." : errorMessage(post.error)}
          onRetry={missing ? undefined : () => void post.refetch()}
        />
      </div>
    );
  }

  const data = post.data;
  const isAuthor = user?.id === data.author.id;
  const actionError = like.error ?? unlike.error ?? remove.error;
  const toggling = like.isPending || unlike.isPending;

  return (
    <article className="flex flex-col gap-6">
      {back}
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{data.title}</h1>
        <p className="text-sm text-zinc-500">
          {data.author.nickname} · {formatDate(data.createdAt)}
          {data.updatedAt.getTime() !== data.createdAt.getTime() && " · edited"}
        </p>
      </header>

      <p className="leading-relaxed break-words whitespace-pre-wrap">{data.body}</p>

      <div className="flex flex-wrap items-center gap-2 border-y border-zinc-200 py-3 dark:border-zinc-800">
        {user ? (
          <Button
            variant={data.likedByMe ? "primary" : "secondary"}
            aria-pressed={data.likedByMe}
            disabled={toggling}
            onClick={() => (data.likedByMe ? unlike : like).mutate({ id })}
          >
            {data.likedByMe ? "Liked" : "Like"} · {data.likeCount}
          </Button>
        ) : (
          <Muted>{data.likeCount} likes</Muted>
        )}
        {(isAuthor || canModerate) && (
          <div className="ml-auto flex gap-2">
            {isAuthor && (
              <Button variant="secondary" onClick={() => navigate({ name: "edit-post", id })}>
                Edit
              </Button>
            )}
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm("Delete this post? Its comments and likes are deleted too.")) {
                  remove.mutate({ id });
                }
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
      {actionError && <Alert>{errorMessage(actionError)}</Alert>}

      <Comments post={data} user={user} canModerate={canModerate} />
    </article>
  );
}
