import { useMutation, useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams } from "expo-router";

import { ErrorView, LoadingView } from "../../../src/components/feedback";
import { orpc, queryClient } from "../../../src/lib/api";
import { leave } from "../../../src/lib/navigation";
import { refreshPostList } from "../../../src/posts/cache";
import { PostForm } from "../../../src/posts/post-form";
import { useUser } from "../../../src/session/use-user";

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useUser();
  const post = useQuery(orpc.posts.get.queryOptions({ input: { id } }));
  const update = useMutation(
    orpc.posts.update.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.posts.get.key({ input: { id } }) });
        refreshPostList();
        leave(`/posts/${id}`);
      },
    }),
  );

  if (!user) return <Redirect href="/sign-in" />;
  if (post.isPending) return <LoadingView />;
  if (post.isError) return <ErrorView error={post.error} onRetry={() => void post.refetch()} />;

  return (
    <PostForm
      initial={post.data}
      submitLabel="Save"
      onSubmit={(values) => update.mutate({ id, ...values })}
      pending={update.isPending}
      error={update.error}
    />
  );
}
