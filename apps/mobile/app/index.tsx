import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, TextButton } from "../src/components/button";
import { ErrorView, ListFooter } from "../src/components/feedback";
import { client, orpc } from "../src/lib/api";
import { formatBadge } from "../src/lib/format";
import { shouldLoadMore, showsLoadError } from "../src/lib/pagination";
import { PostRow, Separator } from "../src/posts/post-row";
import { useUser } from "../src/session/use-user";

const PAGE_SIZE = 20;

export default function PostListScreen() {
  const user = useUser();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const posts = useInfiniteQuery(
    orpc.posts.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ cursor, limit: PAGE_SIZE }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      select: (data) => data.pages.flatMap((page) => page.items),
    }),
  );

  // 로컬 플래그를 써서, 백그라운드 재조회(포커스, 무효화) 때는 당겨서 새로고침 스피너가 보이지 않게 한다.
  function refresh() {
    setRefreshing(true);
    void posts.refetch().finally(() => setRefreshing(false));
  }

  function loadMore() {
    if (shouldLoadMore(posts)) void posts.fetchNextPage();
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            user ? (
              <HeaderActions />
            ) : (
              <TextButton title="로그인" onPress={() => router.push("/sign-in")} />
            ),
        }}
      />
      {showsLoadError(posts) ? (
        <ErrorView error={posts.error} onRetry={() => void posts.refetch()} />
      ) : (
        <FlatList
          data={posts.data}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => <PostRow post={item} />}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={user ? <AccountBar nickname={user.nickname} /> : null}
          ListEmptyComponent={
            posts.isPending ? (
              <ActivityIndicator className="mt-16" color="#737373" />
            ) : (
              <EmptyState signedIn={user !== null} />
            )
          }
          ListFooterComponent={
            <ListFooter
              loading={posts.isFetchingNextPage}
              failed={posts.isFetchNextPageError}
              onRetry={() => void posts.fetchNextPage()}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        />
      )}
    </>
  );
}

/** 워크스페이스, 알림 배지, 글쓰기. 모바일에는 실시간 스트림이 없어 화면에 포커스가 올 때 개수를 새로 읽는다. */
function HeaderActions() {
  const unread = useQuery(orpc.notifications.unreadCount.queryOptions());
  const { refetch } = unread;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const count = unread.data?.count ?? 0;
  const badge = formatBadge(count);
  return (
    <View className="flex-row items-center gap-4">
      <TextButton title="워크스페이스" onPress={() => router.push("/workspaces")} />
      <TextButton
        title={badge ? `🔔 ${badge}` : "🔔"}
        accessibilityLabel={count > 0 ? `알림, 읽지 않음 ${count}개` : "알림"}
        onPress={() => router.push("/notifications")}
      />
      <TextButton title="글쓰기" onPress={() => router.push("/posts/new")} />
    </View>
  );
}

function AccountBar({ nickname }: { nickname: string }) {
  const signOut = useMutation({ mutationFn: () => client.signOut() });
  return (
    <View className="flex-row items-center justify-between border-b border-neutral-100 px-5 py-3">
      <Text className="flex-1 text-sm text-neutral-500" numberOfLines={1}>
        <Text className="font-semibold text-neutral-900">{nickname}</Text>님으로 로그인했어요
      </Text>
      {/* 클라이언트는 서버에 닿지 않아도 로컬에서 로그아웃하므로 오류는 따질 필요가 없다. */}
      <TextButton
        title="로그아웃"
        tone="muted"
        disabled={signOut.isPending}
        onPress={() => signOut.mutate()}
      />
    </View>
  );
}

function EmptyState({ signedIn }: { signedIn: boolean }) {
  return (
    <View className="items-center gap-4 px-8 pt-20">
      <Text className="text-lg font-semibold text-neutral-900">아직 글이 없어요</Text>
      <Text className="text-center text-base text-neutral-500">
        {signedIn ? "첫 글을 써 보세요." : "로그인하고 첫 글을 써 보세요."}
      </Text>
      <Button
        title={signedIn ? "글쓰기" : "로그인"}
        variant="secondary"
        compact
        onPress={() => router.push(signedIn ? "/posts/new" : "/sign-in")}
      />
    </View>
  );
}
