import type { PostDetail } from "@starter/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Alert, FlatList, KeyboardAvoidingView, Text, View } from "react-native";

import { TextButton } from "../../../src/components/button";
import { ErrorView, LoadingView } from "../../../src/components/feedback";
import { orpc } from "../../../src/lib/api";
import { errorMessage } from "../../../src/lib/errors";
import { formatRelativeTime, pluralize } from "../../../src/lib/format";
import { leave } from "../../../src/lib/navigation";
import { refreshPostList } from "../../../src/posts/cache";
import { CommentComposer } from "../../../src/posts/comment-composer";
import { CommentItem } from "../../../src/posts/comment-item";
import { LikeButton } from "../../../src/posts/like-button";
import { useUser } from "../../../src/session/use-user";

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useUser();
  const headerHeight = useHeaderHeight();
  const post = useQuery(orpc.posts.get.queryOptions({ input: { id } }));

  if (post.isPending) return <LoadingView />;
  if (post.isError) return <ErrorView error={post.error} onRetry={() => void post.refetch()} />;

  return (
    <KeyboardAvoidingView
      // Android draws edge to edge, so the window no longer resizes for the keyboard on its own.
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
      className="flex-1 bg-white"
    >
      <FlatList
        data={post.data.comments}
        keyExtractor={(comment) => comment.id}
        renderItem={({ item }) => (
          <CommentItem comment={item} postId={id} isAuthor={item.author.id === user?.id} />
        )}
        ListHeaderComponent={
          <PostHeader post={post.data} isAuthor={post.data.author.id === user?.id} />
        }
        ListEmptyComponent={
          <Text className="px-5 py-4 text-sm text-neutral-500">No comments yet.</Text>
        }
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-4"
      />
      <CommentComposer postId={id} />
    </KeyboardAvoidingView>
  );
}

function PostHeader({ post, isAuthor }: { post: PostDetail; isAuthor: boolean }) {
  return (
    <View className="border-b border-neutral-100 px-5 pb-5 pt-2">
      <Text selectable className="text-2xl font-bold leading-8 text-neutral-900">
        {post.title}
      </Text>
      <Text className="mt-1 text-sm text-neutral-500">
        {post.author.nickname} · {formatRelativeTime(post.createdAt)}
      </Text>
      <Text selectable className="mt-4 text-base leading-6 text-neutral-800">
        {post.body}
      </Text>
      <View className="mt-5 flex-row items-center justify-between">
        <LikeButton post={post} />
        {isAuthor ? <AuthorActions postId={post.id} /> : null}
      </View>
      <Text className="mt-6 text-sm font-semibold text-neutral-900">
        {pluralize(post.comments.length, "comment")}
      </Text>
    </View>
  );
}

function AuthorActions({ postId }: { postId: string }) {
  const remove = useMutation(
    orpc.posts.delete.mutationOptions({
      onSuccess: () => {
        // Leave first: the detail query is still mounted and must not refetch a deleted post.
        leave();
        refreshPostList();
      },
      onError: (error) => Alert.alert("Could not delete the post", errorMessage(error)),
    }),
  );

  function confirmDelete() {
    Alert.alert("Delete this post?", "Its comments and likes are deleted too.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate({ id: postId }) },
    ]);
  }

  return (
    <View className="flex-row items-center gap-5">
      <TextButton title="Edit" onPress={() => router.push(`/posts/${postId}/edit`)} />
      <TextButton
        title="Delete"
        tone="danger"
        disabled={remove.isPending}
        onPress={confirmDelete}
      />
    </View>
  );
}
