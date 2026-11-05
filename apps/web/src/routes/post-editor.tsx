import { POST_BODY_MAX, POST_TITLE_MAX, postInputSchema } from "@starter/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Button, Card, ErrorBanner, Field, TextArea, TextInput } from "../components/ui.tsx";
import { orpc, queryClient, useUser } from "../lib/api.ts";
import { describeError } from "../lib/errors.ts";

/** Handles both /posts/new and /posts/$postId/edit. */
export function PostEditorPage() {
  const { postId } = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const existing = useQuery({
    ...orpc.posts.get.queryOptions({ input: { id: postId ?? "" } }),
    enabled: Boolean(postId),
  });
  // A new post goes where the link said; an edited one stays where it is.
  const workspaceId = postId ? existing.data?.workspaceId : search.workspaceId;
  const workspace = useQuery({
    ...orpc.workspaces.get.queryOptions({ input: { id: workspaceId ?? "" } }),
    enabled: Boolean(workspaceId),
  });

  if (postId && existing.isPending) return <p className="text-sm text-zinc-500">Loading…</p>;
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
    return <ErrorBanner message="Only the author can edit this post." />;
  }

  // The contract's schema trims and checks lengths, exactly as the server will.
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
          {postId ? "Edit post" : "New post"}
          {workspace?.name && <span className="text-zinc-500"> in {workspace.name}</span>}
        </h1>
        <ErrorBanner message={error ? describeError(error) : null} />
        <Field
          label="Title"
          error={touched && issues.has("title") ? `1 to ${POST_TITLE_MAX} characters.` : undefined}
        >
          <TextInput
            value={title}
            maxLength={POST_TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field
          label="Body"
          error={touched && issues.has("body") ? "Write something first." : undefined}
        >
          <TextArea
            value={body}
            maxLength={POST_BODY_MAX}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => history.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : postId ? "Save" : "Publish"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
