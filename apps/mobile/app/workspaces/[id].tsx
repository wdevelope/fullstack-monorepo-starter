import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, FlatList, Text } from "react-native";

import { TextButton } from "../../src/components/button";
import { ErrorView, LoadingView } from "../../src/components/feedback";
import { orpc } from "../../src/lib/api";
import { PostRow, Separator } from "../../src/posts/post-row";

/** A workspace board. Members only; anyone else gets NOT_FOUND from the server. */
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
              title="New post"
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
            {workspace.data.members.length} members · you are {workspace.data.myRole}
          </Text>
        }
        ListEmptyComponent={
          posts.isPending ? (
            <ActivityIndicator className="mt-16" color="#737373" />
          ) : (
            <Text className="px-8 pt-16 text-center text-base text-neutral-500">
              No posts in this workspace yet.
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
