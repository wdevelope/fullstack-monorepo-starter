import type { PostSummary } from "@starter/contracts";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { Link, router, Stack } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, TextButton } from "../src/components/button";
import { ErrorView } from "../src/components/feedback";
import { client, orpc } from "../src/lib/api";
import { formatRelativeTime, pluralize } from "../src/lib/format";
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

  // A local flag, so background refetches (focus, invalidation) do not show the pull spinner.
  function refresh() {
    setRefreshing(true);
    void posts.refetch().finally(() => setRefreshing(false));
  }

  function loadMore() {
    if (posts.hasNextPage && !posts.isFetchingNextPage && !posts.isFetchNextPageError) {
      void posts.fetchNextPage();
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            user ? (
              <TextButton title="New post" onPress={() => router.push("/posts/new")} />
            ) : (
              <TextButton title="Sign in" onPress={() => router.push("/sign-in")} />
            ),
        }}
      />
      {posts.isError && !posts.data ? (
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

function PostRow({ post }: { post: PostSummary }) {
  return (
    <Link href={`/posts/${post.id}`} asChild>
      <Pressable className="px-5 py-4 active:bg-neutral-50">
        <Text className="text-[17px] font-semibold leading-6 text-neutral-900" numberOfLines={2}>
          {post.title}
        </Text>
        <Text className="mt-1 text-[15px] leading-5 text-neutral-600" numberOfLines={3}>
          {post.excerpt}
        </Text>
        <Text className="mt-2 text-xs text-neutral-500">
          {[
            post.author.nickname,
            formatRelativeTime(post.createdAt),
            pluralize(post.likeCount, "like"),
            pluralize(post.commentCount, "comment"),
          ].join(" · ")}
        </Text>
      </Pressable>
    </Link>
  );
}

function Separator() {
  return <View className="mx-5 h-px bg-neutral-100" />;
}

function AccountBar({ nickname }: { nickname: string }) {
  const signOut = useMutation({ mutationFn: () => client.signOut() });
  return (
    <View className="flex-row items-center justify-between border-b border-neutral-100 px-5 py-3">
      <Text className="flex-1 text-sm text-neutral-500" numberOfLines={1}>
        Signed in as <Text className="font-semibold text-neutral-900">{nickname}</Text>
      </Text>
      {/* The client signs out locally even when the server cannot be reached, so errors are moot. */}
      <TextButton
        title="Sign out"
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
      <Text className="text-lg font-semibold text-neutral-900">No posts yet</Text>
      <Text className="text-center text-base text-neutral-500">
        {signedIn ? "Start the conversation." : "Sign in to write the first one."}
      </Text>
      <Button
        title={signedIn ? "Write a post" : "Sign in"}
        variant="secondary"
        compact
        onPress={() => router.push(signedIn ? "/posts/new" : "/sign-in")}
      />
    </View>
  );
}

function ListFooter({
  loading,
  failed,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  if (loading) return <ActivityIndicator className="my-6" color="#737373" />;
  if (!failed) return null;
  return (
    <View className="items-center gap-2 py-6">
      <Text className="text-sm text-neutral-500">Could not load more posts.</Text>
      <TextButton title="Try again" onPress={onRetry} />
    </View>
  );
}
