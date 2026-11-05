import type { PostDetail } from "@starter/contracts";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert, Pressable, Text } from "react-native";

import { orpc } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { useUser } from "../session/use-user";
import { refreshPostList, updateCachedPost } from "./cache";

export function LikeButton({ post }: { post: PostDetail }) {
  const user = useUser();
  const mutationOptions = {
    onSuccess: (state: { likeCount: number; likedByMe: boolean }) => {
      updateCachedPost(post.id, (cached) => ({ ...cached, ...state }));
      refreshPostList();
    },
    onError: (error: unknown) => Alert.alert("Could not update the like", errorMessage(error)),
  };
  const like = useMutation(orpc.posts.like.mutationOptions(mutationOptions));
  const unlike = useMutation(orpc.posts.unlike.mutationOptions(mutationOptions));

  // Show the expected result while the request is in flight; the cache catches up on success.
  const pending = like.isPending || unlike.isPending;
  const liked = pending ? like.isPending : post.likedByMe;
  const count = liked === post.likedByMe ? post.likeCount : post.likeCount + (liked ? 1 : -1);

  function toggle() {
    if (!user) router.push("/sign-in");
    else if (post.likedByMe) unlike.mutate({ id: post.id });
    else like.mutate({ id: post.id });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={liked ? "Unlike" : "Like"}
      accessibilityState={{ selected: liked, busy: pending }}
      disabled={pending}
      hitSlop={8}
      onPress={toggle}
      className="flex-row items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-1.5 active:opacity-60"
    >
      <Text className={`text-base ${liked ? "text-red-500" : "text-neutral-400"}`}>
        {liked ? "♥" : "♡"}
      </Text>
      <Text className="text-sm font-medium text-neutral-700">{count}</Text>
    </Pressable>
  );
}
