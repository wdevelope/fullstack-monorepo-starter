import { COMMENT_BODY_MAX, type PostDetail, type User } from "@starter/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Alert, Button, Muted, TextAreaField } from "../../components/ui.tsx";
import { errorMessage, fieldErrors } from "../../lib/errors.ts";
import { formatDate } from "../../lib/format.ts";
import { orpc } from "../../lib/orpc.ts";

export function Comments({ post, user }: { post: PostDetail; user: User | null }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  // The detail holds the comments; the list shows their count.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.posts.get.queryKey({ input: { id: post.id } }),
      }),
      queryClient.invalidateQueries({ queryKey: orpc.posts.list.key() }),
    ]);
  const create = useMutation(
    orpc.comments.create.mutationOptions({
      onSuccess: async () => {
        setBody("");
        await refresh();
      },
    }),
  );
  const remove = useMutation(orpc.comments.delete.mutationOptions({ onSuccess: refresh }));

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Comments ({post.comments.length})</h2>

      {post.comments.length === 0 && <Muted>No comments yet.</Muted>}
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {post.comments.map((comment) => (
          <li key={comment.id} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-xs text-zinc-500">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {comment.author.nickname}
                </span>{" "}
                · {formatDate(comment.createdAt)}
              </p>
              <p className="mt-1 text-sm break-words whitespace-pre-wrap">{comment.body}</p>
            </div>
            {user?.id === comment.author.id && (
              <Button
                variant="danger"
                disabled={remove.isPending && remove.variables.id === comment.id}
                onClick={() => remove.mutate({ id: comment.id })}
              >
                Delete
              </Button>
            )}
          </li>
        ))}
      </ul>
      {remove.error && <Alert>{errorMessage(remove.error)}</Alert>}

      {user ? (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ postId: post.id, body });
          }}
        >
          <TextAreaField
            label="Add a comment"
            rows={3}
            maxLength={COMMENT_BODY_MAX}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            error={fieldErrors(create.error).body}
          />
          {create.error && <Alert>{errorMessage(create.error)}</Alert>}
          <Button type="submit" className="self-end" disabled={create.isPending}>
            Comment
          </Button>
        </form>
      ) : (
        <Muted>Sign in to comment.</Muted>
      )}
    </section>
  );
}
