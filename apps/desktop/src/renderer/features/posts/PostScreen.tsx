import { ORPCError } from "@orpc/client";
import { workspacePermissions, type User } from "@starter/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, ErrorNotice, Muted } from "../../components/ui.tsx";
import { errorMessage } from "../../lib/errors.ts";
import { timeAgo } from "../../lib/format.ts";
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
  // 워크스페이스 글이면 뒤로 가기 버튼에 쓸 이름과, 관리 권한을 가릴 호출자의 역할을 가져온다.
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
      ← {workspaceId ? (workspace.data?.name ?? "워크스페이스") : "공개 게시판"}
    </Button>
  );

  if (post.isPending) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Muted>불러오는 중…</Muted>
      </div>
    );
  }
  if (post.isError) {
    const missing = post.error instanceof ORPCError && post.error.code === "NOT_FOUND";
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorNotice
          message={missing ? "없거나 삭제된 글이에요." : errorMessage(post.error)}
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
          {data.author.nickname} · {timeAgo(data.createdAt)}
          {data.updatedAt.getTime() !== data.createdAt.getTime() && " · 수정됨"}
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
            좋아요 · {data.likeCount}
          </Button>
        ) : (
          <Muted>좋아요 {data.likeCount}</Muted>
        )}
        {(isAuthor || canModerate) && (
          <div className="ml-auto flex gap-2">
            {isAuthor && (
              <Button variant="secondary" onClick={() => navigate({ name: "edit-post", id })}>
                수정
              </Button>
            )}
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm("이 글을 삭제할까요? 댓글과 좋아요도 함께 삭제돼요.")) {
                  remove.mutate({ id });
                }
              }}
            >
              삭제
            </Button>
          </div>
        )}
      </div>
      {actionError && <Alert>{errorMessage(actionError)}</Alert>}

      <Comments post={data} user={user} canModerate={canModerate} />
    </article>
  );
}
