import { ActivityIndicator, Text, View } from "react-native";

import { errorMessage } from "../lib/errors";
import { Button, TextButton } from "./button";

export function ErrorBanner({ error }: { error: unknown }) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="rounded-xl bg-red-50 px-4 py-3"
    >
      <Text className="text-sm leading-5 text-red-700">{errorMessage(error)}</Text>
    </View>
  );
}

export function LoadingView() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator color="#737373" />
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white px-8">
      <Text className="text-center text-base leading-6 text-neutral-600">
        {errorMessage(error)}
      </Text>
      <Button title="다시 시도" variant="secondary" compact onPress={onRetry} />
    </View>
  );
}

/** 무한 목록의 끝. 다음 페이지를 읽는 중이면 스피너, 실패했으면 "다시 시도"를 보인다(PLAT-5). */
export function ListFooter({
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
      <Text className="text-sm text-neutral-500">글을 더 불러오지 못했어요.</Text>
      <TextButton title="다시 시도" onPress={onRetry} />
    </View>
  );
}
