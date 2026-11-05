import { ActivityIndicator, Text, View } from "react-native";

import { errorMessage } from "../lib/errors";
import { Button } from "./button";

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
      <Button title="Try again" variant="secondary" compact onPress={onRetry} />
    </View>
  );
}
