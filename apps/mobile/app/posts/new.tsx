import { useMutation } from "@tanstack/react-query";
import { Redirect, router } from "expo-router";

import { orpc } from "../../src/lib/api";
import { refreshPostList } from "../../src/posts/cache";
import { PostForm } from "../../src/posts/post-form";
import { useUser } from "../../src/session/use-user";

export default function NewPostScreen() {
  const user = useUser();
  const create = useMutation(
    orpc.posts.create.mutationOptions({
      onSuccess: ({ id }) => {
        refreshPostList();
        router.replace(`/posts/${id}`);
      },
    }),
  );

  if (!user) return <Redirect href="/sign-in" />;

  return (
    <PostForm
      submitLabel="Publish"
      onSubmit={(values) => create.mutate(values)}
      pending={create.isPending}
      error={create.error}
    />
  );
}
