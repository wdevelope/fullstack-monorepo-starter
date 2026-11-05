import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Button, ErrorBanner } from "../components/ui.tsx";
import { orpc, useUser } from "../lib/api.ts";
import { describeError } from "../lib/errors.ts";
import { timeAgo } from "../lib/time.ts";

export function PostListPage() {
  const user = useUser();
  const posts = useInfiniteQuery(
    orpc.posts.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ cursor, limit: 10 }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );
  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Posts</h1>
        {user && (
          <Link to="/posts/new">
            <Button>New post</Button>
          </Link>
        )}
      </div>

      <ErrorBanner message={posts.error ? describeError(posts.error) : null} />
      {posts.isPending && <p className="text-sm text-zinc-500">Loading…</p>}
      {posts.isSuccess && items.length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-500">
          No posts yet. Write the first one.
        </p>
      )}

      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {items.map((post) => (
          <li key={post.id}>
            <Link
              to="/posts/$postId"
              params={{ postId: post.id }}
              className="block px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <h2 className="font-medium">{post.title}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                {post.excerpt}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                {post.author.nickname} · {timeAgo(post.createdAt)} · {post.commentCount} comments ·{" "}
                {post.likeCount} likes
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {posts.hasNextPage && (
        <Button
          variant="secondary"
          className="w-full"
          disabled={posts.isFetchingNextPage}
          onClick={() => posts.fetchNextPage()}
        >
          {posts.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
