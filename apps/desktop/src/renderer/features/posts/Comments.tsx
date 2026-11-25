import { COMMENT_BODY_MAX, type PostDetail, type User } from "@starter/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Alert, Button, Muted, TextAreaField } from "../../components/ui.tsx";
import { errorMessage, fieldErrors } from "../../lib/errors.ts";
import { formatDate } from "../../lib/format.ts";
import { orpc } from "../../lib/orpc.ts";

export function Comments({
  post,
  user,
  canModerate,
}: {
  post: PostDetail;
  user: User | null;
  /** 워크스페이스 관리자와 소유자는 그 안에서 누구의 댓글이든 삭제할 수 있다. */
  canModerate: boolean;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  // 상세에는 댓글이 있고, 목록은 댓글 수를 보여 준다.
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
      <h2 className="text-lg font-semibold">댓글 ({post.comments.length})</h2>

      {post.comments.length === 0 && <Muted>아직 댓글이 없어요.</Muted>}
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
            {(user?.id === comment.author.id || canModerate) && (
              <Button
                variant="danger"
                disabled={remove.isPending && remove.variables.id === comment.id}
                onClick={() => remove.mutate({ id: comment.id })}
              >
                삭제
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
            label="댓글 남기기"
            rows={3}
            maxLength={COMMENT_BODY_MAX}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            error={fieldErrors(create.error).body}
          />
          {create.error && <Alert>{errorMessage(create.error)}</Alert>}
          <Button type="submit" className="self-end" disabled={create.isPending}>
            댓글 달기
          </Button>
        </form>
      ) : (
        <Muted>댓글을 남기려면 로그인해 주세요.</Muted>
      )}
    </section>
  );
}
