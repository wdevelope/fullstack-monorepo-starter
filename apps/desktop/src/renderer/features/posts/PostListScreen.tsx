import type { User } from "@starter/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";

import { Button, ErrorNotice, Muted } from "../../components/ui.tsx";
import { errorMessage } from "../../lib/errors.ts";
import { timeAgo } from "../../lib/format.ts";
import type { Navigate } from "../../lib/navigation.ts";
import { orpc } from "../../lib/orpc.ts";

const PAGE_SIZE = 20;

export function PostListScreen({ user, navigate }: { user: User | null; navigate: Navigate }) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">공개 게시판</h1>
        {user ? (
          <Button onClick={() => navigate({ name: "new-post" })}>글쓰기</Button>
        ) : (
          <Muted>로그인하면 글을 쓰고 좋아요와 댓글을 남길 수 있어요.</Muted>
        )}
      </div>
      <PostList navigate={navigate} />
    </section>
  );
}

/** 공개 게시판. `workspaceId`가 있으면 그 워크스페이스의 게시판이다. */
export function PostList({ workspaceId, navigate }: { workspaceId?: string; navigate: Navigate }) {
  const posts = useInfiniteQuery(
    orpc.posts.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ cursor, limit: PAGE_SIZE, workspaceId }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );
  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {posts.isPending && <Muted>글을 불러오는 중…</Muted>}
      {posts.isError && (
        <ErrorNotice message={errorMessage(posts.error)} onRetry={() => void posts.refetch()} />
      )}
      {posts.isSuccess && items.length === 0 && <Muted>아직 글이 없어요.</Muted>}

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((post) => (
            <li key={post.id}>
              <button
                type="button"
                onClick={() => navigate({ name: "post", id: post.id })}
                className="w-full rounded-lg border border-zinc-200 bg-white p-4 text-left transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
              >
                <h2 className="font-semibold">{post.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {post.excerpt}
                </p>
                <p className="mt-3 text-xs text-zinc-500">
                  {post.author.nickname} · {timeAgo(post.createdAt)} · 댓글 {post.commentCount} ·
                  좋아요 {post.likeCount}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {posts.hasNextPage && (
        <Button
          variant="secondary"
          className="self-center"
          disabled={posts.isFetchingNextPage}
          onClick={() => void posts.fetchNextPage()}
        >
          {posts.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
        </Button>
      )}
    </div>
  );
}
