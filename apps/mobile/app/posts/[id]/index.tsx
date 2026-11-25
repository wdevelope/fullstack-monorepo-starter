import type { PostDetail } from "@starter/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Alert, FlatList, KeyboardAvoidingView, Text, View } from "react-native";

import { TextButton } from "../../../src/components/button";
import { ErrorView, LoadingView } from "../../../src/components/feedback";
import { orpc } from "../../../src/lib/api";
import { errorMessage } from "../../../src/lib/errors";
import { formatRelativeTime } from "../../../src/lib/format";
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
      // Android는 화면 끝까지(edge to edge) 그리므로, 창이 키보드에 맞춰 스스로 크기를 바꾸지 않는다.
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
          <Text className="px-5 py-4 text-sm text-neutral-500">아직 댓글이 없어요.</Text>
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
        {`댓글 ${post.comments.length}`}
      </Text>
    </View>
  );
}

function AuthorActions({ postId }: { postId: string }) {
  const remove = useMutation(
    orpc.posts.delete.mutationOptions({
      onSuccess: () => {
        // 먼저 화면을 떠난다. 상세 쿼리가 아직 마운트돼 있어 삭제된 글을 다시 불러오면 안 된다.
        leave();
        refreshPostList();
      },
      onError: (error) => Alert.alert("글을 삭제하지 못했어요", errorMessage(error)),
    }),
  );

  function confirmDelete() {
    Alert.alert("이 글을 삭제할까요?", "댓글과 좋아요도 함께 삭제돼요.", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => remove.mutate({ id: postId }) },
    ]);
  }

  return (
    <View className="flex-row items-center gap-5">
      <TextButton title="수정" onPress={() => router.push(`/posts/${postId}/edit`)} />
      <TextButton title="삭제" tone="danger" disabled={remove.isPending} onPress={confirmDelete} />
    </View>
  );
}
