import { POST_BODY_MAX, POST_TITLE_MAX, postInputSchema } from "@starter/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Button, Card, ErrorBanner, Field, TextArea, TextInput } from "../components/ui.tsx";
import { orpc, queryClient, useUser } from "../lib/api.ts";
import { describeError } from "../lib/errors.ts";

/** /posts/new와 /posts/$postId/edit를 함께 처리한다. */
export function PostEditorPage() {
  const { postId } = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const existing = useQuery({
    ...orpc.posts.get.queryOptions({ input: { id: postId ?? "" } }),
    enabled: Boolean(postId),
  });
  // 새 글은 링크가 가리킨 곳에 쓰고, 수정하는 글은 있던 곳에 그대로 둔다.
  const workspaceId = postId ? existing.data?.workspaceId : search.workspaceId;
  const workspace = useQuery({
    ...orpc.workspaces.get.queryOptions({ input: { id: workspaceId ?? "" } }),
    enabled: Boolean(workspaceId),
  });

  if (postId && existing.isPending) return <p className="text-sm text-zinc-500">불러오는 중…</p>;
  if (existing.isError) return <ErrorBanner message={describeError(existing.error)} />;
  if (workspace.isError) return <ErrorBanner message={describeError(workspace.error)} />;
  return (
    <PostForm
      postId={postId}
      initial={existing.data}
      workspace={workspaceId ? { id: workspaceId, name: workspace.data?.name } : undefined}
    />
  );
}

function PostForm({
  postId,
  initial,
  workspace,
}: {
  postId: string | undefined;
  initial: { title: string; body: string; author: { id: string } } | undefined;
  workspace: { id: string; name: string | undefined } | undefined;
}) {
  const user = useUser();
  const navigate = useNavigate();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [touched, setTouched] = useState(false);

  const done = async ({ id }: { id: string }) => {
    await queryClient.invalidateQueries({ queryKey: orpc.posts.key() });
    await navigate({ to: "/posts/$postId", params: { postId: id } });
  };
  const create = useMutation(orpc.posts.create.mutationOptions({ onSuccess: done }));
  const update = useMutation(orpc.posts.update.mutationOptions({ onSuccess: done }));
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  if (initial && initial.author.id !== user?.id) {
    return <ErrorBanner message="작성자만 이 글을 수정할 수 있어요." />;
  }

  // 계약의 스키마가 서버와 똑같이 앞뒤 공백을 지우고 길이를 검사한다.
  const parsed = postInputSchema.safeParse({ title, body });
  const issues = new Set(parsed.error?.issues.map((issue) => issue.path[0]));

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!parsed.success) return;
    if (postId) update.mutate({ id: postId, ...parsed.data });
    else create.mutate({ ...parsed.data, workspaceId: workspace?.id });
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <h1 className="text-xl font-semibold">
          {postId ? "글 수정" : "글쓰기"}
          {workspace?.name && <span className="text-zinc-500"> · {workspace.name}</span>}
        </h1>
        <ErrorBanner message={error ? describeError(error) : null} />
        <Field
          label="제목"
          error={
            touched && issues.has("title") ? `1~${POST_TITLE_MAX}자로 입력해 주세요.` : undefined
          }
        >
          <TextInput
            value={title}
            maxLength={POST_TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field
          label="본문"
          error={touched && issues.has("body") ? "본문을 입력해 주세요." : undefined}
        >
          <TextArea
            value={body}
            maxLength={POST_BODY_MAX}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => history.back()}>
            취소
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "저장하는 중…" : postId ? "저장" : "등록"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
