import { useMutation } from "@tanstack/react-query";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { orpc } from "../../src/lib/api";
import { refreshPostList } from "../../src/posts/cache";
import { PostForm } from "../../src/posts/post-form";
import { useUser } from "../../src/session/use-user";

export default function NewPostScreen() {
  const user = useUser();
  // 워크스페이스 게시판에서 열었을 때만 있고, 공개 게시판에서는 없다.
  const { workspaceId } = useLocalSearchParams<{ workspaceId?: string }>();
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
      submitLabel="등록"
      onSubmit={(values) => create.mutate({ ...values, workspaceId })}
      pending={create.isPending}
      error={create.error}
    />
  );
}
