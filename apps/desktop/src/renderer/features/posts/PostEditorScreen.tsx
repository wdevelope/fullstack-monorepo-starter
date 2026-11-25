import { POST_BODY_MAX, POST_TITLE_MAX } from "@starter/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  Alert,
  Button,
  ErrorNotice,
  Muted,
  TextAreaField,
  TextField,
} from "../../components/ui.tsx";
import { errorMessage, fieldErrors } from "../../lib/errors.ts";
import type { Navigate } from "../../lib/navigation.ts";
import { orpc } from "../../lib/orpc.ts";

interface PostValues {
  title: string;
  body: string;
}

function PostForm(props: {
  heading: string;
  initial: PostValues;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (values: PostValues) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(props.initial.title);
  const [body, setBody] = useState(props.initial.body);
  const fields = fieldErrors(props.error);

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit({ title, body });
      }}
    >
      <h1 className="text-2xl font-semibold tracking-tight">{props.heading}</h1>
      <TextField
        label="제목"
        autoFocus
        maxLength={POST_TITLE_MAX}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={fields.title}
      />
      <TextAreaField
        label="내용"
        rows={12}
        maxLength={POST_BODY_MAX}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        error={fields.body}
      />
      {props.error !== null && <Alert>{errorMessage(props.error)}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={props.onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={props.pending}>
          {props.submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function NewPostScreen({
  workspaceId,
  navigate,
}: {
  workspaceId: string | undefined;
  navigate: Navigate;
}) {
  const queryClient = useQueryClient();
  const workspace = useQuery({
    ...orpc.workspaces.get.queryOptions({ input: { id: workspaceId ?? "" } }),
    enabled: Boolean(workspaceId),
  });
  const create = useMutation(
    orpc.posts.create.mutationOptions({
      onSuccess: ({ id }) => {
        void queryClient.invalidateQueries({ queryKey: orpc.posts.list.key() });
        navigate({ name: "post", id });
      },
    }),
  );

  return (
    <PostForm
      heading={workspace.data ? `${workspace.data.name}에 글쓰기` : "글쓰기"}
      initial={{ title: "", body: "" }}
      submitLabel="등록"
      pending={create.isPending}
      error={create.error}
      onSubmit={(values) => create.mutate({ ...values, workspaceId })}
      onCancel={() =>
        navigate(workspaceId ? { name: "workspace", id: workspaceId } : { name: "posts" })
      }
    />
  );
}

export function EditPostScreen({ id, navigate }: { id: string; navigate: Navigate }) {
  const queryClient = useQueryClient();
  const post = useQuery(orpc.posts.get.queryOptions({ input: { id } }));
  const update = useMutation(
    orpc.posts.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.posts.get.queryKey({ input: { id } }) }),
          queryClient.invalidateQueries({ queryKey: orpc.posts.list.key() }),
        ]);
        navigate({ name: "post", id });
      },
    }),
  );

  if (post.isPending) return <Muted>불러오는 중…</Muted>;
  if (post.isError) return <ErrorNotice message={errorMessage(post.error)} />;

  return (
    <PostForm
      // 폼은 글을 로컬 상태로 한 번만 복사한다. id가 바뀌면 새 폼으로 시작한다.
      key={post.data.id}
      heading="글 수정"
      initial={post.data}
      submitLabel="저장"
      pending={update.isPending}
      error={update.error}
      onSubmit={(values) => update.mutate({ id, ...values })}
      onCancel={() => navigate({ name: "post", id })}
    />
  );
}
