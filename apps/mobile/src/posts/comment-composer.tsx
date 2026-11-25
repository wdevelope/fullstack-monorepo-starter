import { COMMENT_BODY_MAX } from "@starter/contracts";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../components/button";
import { orpc } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { useUser } from "../session/use-user";
import { refreshPostList, updateCachedPost } from "./cache";

/** 댓글 아래에 고정된다. 로그아웃한 독자에게는 대신 로그인 안내를 보인다. */
export function CommentComposer({ postId }: { postId: string }) {
  const user = useUser();
  const insets = useSafeAreaInsets();
  const [body, setBody] = useState("");
  const create = useMutation(
    orpc.comments.create.mutationOptions({
      onSuccess: (comment) => {
        updateCachedPost(postId, (post) => ({ ...post, comments: [...post.comments, comment] }));
        refreshPostList();
        setBody("");
      },
    }),
  );
  const trimmed = body.trim();

  return (
    <View
      className="border-t border-neutral-200 bg-white px-4 pt-3"
      style={{ paddingBottom: insets.bottom + 12 }}
    >
      {!user ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/sign-in")}
          className="py-2 active:opacity-60"
        >
          <Text className="text-center text-base text-neutral-500">
            <Text className="font-semibold text-neutral-900">로그인</Text>하고 좋아요와 댓글을 남겨
            보세요
          </Text>
        </Pressable>
      ) : (
        <>
          {create.error ? (
            <Text className="mb-2 text-sm text-red-600">{errorMessage(create.error)}</Text>
          ) : null}
          <View className="flex-row items-end gap-2">
            <TextInput
              accessibilityLabel="댓글"
              placeholder="댓글을 남겨 보세요"
              placeholderTextColor="#a3a3a3"
              value={body}
              onChangeText={setBody}
              maxLength={COMMENT_BODY_MAX}
              multiline
              className="max-h-32 min-h-11 flex-1 rounded-2xl border border-neutral-300 px-4 py-2.5 text-base text-neutral-900 focus:border-neutral-900"
            />
            <Button
              title="댓글 달기"
              compact
              disabled={!trimmed}
              loading={create.isPending}
              onPress={() => create.mutate({ postId, body: trimmed })}
            />
          </View>
        </>
      )}
    </View>
  );
}
