import type { PostSummary } from "@starter/contracts";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { formatRelativeTime, pluralize } from "../lib/format";

export function PostRow({ post }: { post: PostSummary }) {
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

export function Separator() {
  return <View className="mx-5 h-px bg-neutral-100" />;
}
