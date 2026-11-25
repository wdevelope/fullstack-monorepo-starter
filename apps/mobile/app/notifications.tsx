import type { Notification } from "@starter/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Redirect, router, Stack, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { TextButton } from "../src/components/button";
import { ErrorView, LoadingView } from "../src/components/feedback";
import { orpc, queryClient } from "../src/lib/api";
import { formatRelativeTime, notificationText } from "../src/lib/format";
import { useUser } from "../src/session/use-user";

/** 알림함. 모바일에는 아직 실시간 스트림이 없어 화면에 포커스가 올 때마다 새로 읽는다. */
export default function NotificationsScreen() {
  const user = useUser();
  const list = useQuery(orpc.notifications.list.queryOptions({ input: { limit: 50 } }));
  const { refetch } = list;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const markRead = useMutation(
    orpc.notifications.markRead.mutationOptions({
      onSuccess: ({ unreadCount }) => {
        queryClient.setQueryData(orpc.notifications.unreadCount.queryKey(), {
          count: unreadCount,
        });
        void queryClient.invalidateQueries({ queryKey: orpc.notifications.list.key() });
      },
    }),
  );

  if (!user) return <Redirect href="/sign-in" />;
  if (list.isPending) return <LoadingView />;
  if (list.isError) return <ErrorView error={list.error} onRetry={() => void list.refetch()} />;

  function open(notification: Notification) {
    if (!notification.readAt) markRead.mutate({ ids: [notification.id] });
    router.push(`/posts/${notification.post.id}`);
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TextButton
              title="모두 읽음"
              disabled={markRead.isPending}
              onPress={() => markRead.mutate({})}
            />
          ),
        }}
      />
      <FlatList
        className="bg-white"
        data={list.data.items}
        keyExtractor={(notification) => notification.id}
        ListEmptyComponent={
          <Text className="px-8 pt-16 text-center text-base text-neutral-500">
            아직 알림이 없어요.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            className="flex-row items-start gap-3 px-5 py-4 active:bg-neutral-50"
            onPress={() => open(item)}
          >
            <View
              className={`mt-2 size-2 rounded-full ${item.readAt ? "bg-transparent" : "bg-blue-500"}`}
            />
            <View className="flex-1">
              <Text
                className={`text-[15px] text-neutral-900 ${item.readAt ? "" : "font-semibold"}`}
              >
                {notificationText(item)}
              </Text>
              <Text className="mt-1 text-xs text-neutral-500">
                {formatRelativeTime(item.createdAt)}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </>
  );
}
