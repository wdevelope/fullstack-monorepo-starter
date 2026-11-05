import { COMMENT_BODY_MAX } from "@starter/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Button, Card, ErrorBanner, TextArea } from "../components/ui.tsx";
import { orpc, queryClient, useUser } from "../lib/api.ts";
import { describeError } from "../lib/errors.ts";
import { timeAgo } from "../lib/time.ts";

const route = getRouteApi("/posts/$postId");

export function PostPage() {
  const { postId } = route.useParams();
  const user = useUser();
  const navigate = useNavigate();
  const [comment, setComment] = useState("");

  const postQuery = orpc.posts.get.queryOptions({ input: { id: postId } });
  const post = useQuery(postQuery);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: postQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: orpc.posts.list.key() }),
    ]);

  const like = useMutation(
    orpc.posts.like.mutationOptions({
      onSuccess: (state) =>
        queryClient.setQueryData(postQuery.queryKey, (old) => old && { ...old, ...state }),
    }),
  );
  const unlike = useMutation(
    orpc.posts.unlike.mutationOptions({
      onSuccess: (state) =>
        queryClient.setQueryData(postQuery.queryKey, (old) => old && { ...old, ...state }),
    }),
  );
  const addComment = useMutation(
    orpc.comments.create.mutationOptions({
      onSuccess: async () => {
        setComment("");
        await refresh();
      },
    }),
  );
  const deleteComment = useMutation(orpc.comments.delete.mutationOptions({ onSuccess: refresh }));
  const deletePost = useMutation(
    orpc.posts.delete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.posts.list.key() });
        await navigate({ to: "/" });
      },
    }),
  );

  if (post.isPending) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (post.isError) return <ErrorBanner message={describeError(post.error)} />;

  const data = post.data;
  const isAuthor = user?.id === data.author.id;
  const mutationError = [like, unlike, addComment, deleteComment, deletePost].find(
    (m) => m.error,
  )?.error;

  function submitComment(event: FormEvent) {
    event.preventDefault();
    if (comment.trim()) addComment.mutate({ postId, body: comment });
  }

  return (
    <div className="space-y-6">
      <Card>
        <article className="space-y-4">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold">{data.title}</h1>
            <p className="text-sm text-zinc-500">
              {data.author.nickname} · {timeAgo(data.createdAt)}
              {data.updatedAt.getTime() !== data.createdAt.getTime() && " · edited"}
            </p>
          </header>
          <p className="whitespace-pre-wrap leading-relaxed">{data.body}</p>
          <footer className="flex items-center gap-2 pt-2">
            <Button
              variant="secondary"
              disabled={!user || like.isPending || unlike.isPending}
              title={user ? undefined : "Sign in to like"}
              onClick={() => (data.likedByMe ? unlike : like).mutate({ id: postId })}
            >
              {data.likedByMe ? "♥ Liked" : "♡ Like"} · {data.likeCount}
            </Button>
            {isAuthor && (
              <>
                <Link to="/posts/$postId/edit" params={{ postId }} className="ml-auto">
                  <Button variant="secondary">Edit</Button>
                </Link>
                <Button
                  variant="danger"
                  disabled={deletePost.isPending}
                  onClick={() => {
                    if (confirm("Delete this post and its comments?")) {
                      deletePost.mutate({ id: postId });
                    }
                  }}
                >
                  Delete
                </Button>
              </>
            )}
          </footer>
        </article>
      </Card>

      <ErrorBanner message={mutationError ? describeError(mutationError) : null} />

      <section className="space-y-3">
        <h2 className="font-semibold">Comments ({data.comments.length})</h2>
        <ul className="space-y-3">
          {data.comments.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>
                  {c.author.nickname} · {timeAgo(c.createdAt)}
                </span>
                {user?.id === c.author.id && (
                  <button
                    className="text-red-600 hover:underline dark:text-red-400"
                    onClick={() => deleteComment.mutate({ id: c.id })}
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            </li>
          ))}
        </ul>

        {user ? (
          <form onSubmit={submitComment} className="space-y-2">
            <TextArea
              aria-label="Write a comment"
              placeholder="Write a comment"
              maxLength={COMMENT_BODY_MAX}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="min-h-20"
            />
            <Button type="submit" disabled={addComment.isPending || !comment.trim()}>
              Comment
            </Button>
          </form>
        ) : (
          <p className="text-sm text-zinc-500">
            <Link
              to="/login"
              search={{ redirect: `/posts/${postId}` }}
              className="font-medium text-indigo-600 dark:text-indigo-400"
            >
              Sign in
            </Link>{" "}
            to comment.
          </p>
        )}
      </section>
    </div>
  );
}
