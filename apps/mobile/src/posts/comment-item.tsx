import type { Comment } from "@starter/contracts";
import { useMutation } from "@tanstack/react-query";
import { Alert, Text, View } from "react-native";

import { TextButton } from "../components/button";
import { orpc } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { formatRelativeTime } from "../lib/format";
import { refreshPostList, updateCachedPost } from "./cache";

export function CommentItem({
  comment,
  postId,
  isAuthor,
}: {
  comment: Comment;
  postId: string;
  isAuthor: boolean;
}) {
  const remove = useMutation(
    orpc.comments.delete.mutationOptions({
      onSuccess: () => {
        updateCachedPost(postId, (post) => ({
          ...post,
          comments: post.comments.filter((other) => other.id !== comment.id),
        }));
        refreshPostList();
      },
      onError: (error) => Alert.alert("댓글을 삭제하지 못했어요", errorMessage(error)),
    }),
  );

  function confirmDelete() {
    Alert.alert("이 댓글을 삭제할까요?", undefined, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => remove.mutate({ id: comment.id }) },
    ]);
  }

  return (
    <View className={`px-5 py-3 ${remove.isPending ? "opacity-40" : ""}`}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-sm text-neutral-500" numberOfLines={1}>
          <Text className="font-semibold text-neutral-900">{comment.author.nickname}</Text>
          {` · ${formatRelativeTime(comment.createdAt)}`}
        </Text>
        {isAuthor ? (
          <TextButton
            title="삭제"
            tone="muted"
            onPress={confirmDelete}
            disabled={remove.isPending}
          />
        ) : null}
      </View>
      <Text selectable className="mt-1 text-[15px] leading-5 text-neutral-800">
        {comment.body}
      </Text>
    </View>
  );
}
