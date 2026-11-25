import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, Text } from "react-native";

import { TextButton } from "../../src/components/button";
import { ErrorView, LoadingView } from "../../src/components/feedback";
import { orpc } from "../../src/lib/api";
import { roleLabel } from "../../src/lib/format";
import { PostRow, Separator } from "../../src/posts/post-row";

/** 워크스페이스 게시판. 멤버만 볼 수 있고, 그 밖의 사람은 서버에서 NOT_FOUND를 받는다. */
export default function WorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspace = useQuery(orpc.workspaces.get.queryOptions({ input: { id } }));
  const posts = useInfiniteQuery(
    orpc.posts.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ cursor, limit: 20, workspaceId: id }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      select: (data) => data.pages.flatMap((page) => page.items),
    }),
  );

  if (workspace.isPending) return <LoadingView />;
  if (workspace.isError) {
    return <ErrorView error={workspace.error} onRetry={() => void workspace.refetch()} />;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: workspace.data.name,
          headerRight: () => (
            <TextButton
              title="글쓰기"
              onPress={() => router.push({ pathname: "/posts/new", params: { workspaceId: id } })}
            />
          ),
        }}
      />
      <FlatList
        className="bg-white"
        data={posts.data}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => <PostRow post={item} />}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <Text className="px-5 pt-3 text-xs text-neutral-500">
            멤버 {workspace.data.members.length}명 · 내 역할: {roleLabel[workspace.data.myRole]}
          </Text>
        }
        ListEmptyComponent={
          posts.isPending ? (
            <ActivityIndicator className="mt-16" color="#737373" />
          ) : (
            <Text className="px-8 pt-16 text-center text-base text-neutral-500">
              이 워크스페이스에는 아직 글이 없어요.
            </Text>
          )
        }
        onEndReached={() => {
          if (posts.hasNextPage && !posts.isFetchingNextPage) void posts.fetchNextPage();
        }}
      />
    </>
  );
}
