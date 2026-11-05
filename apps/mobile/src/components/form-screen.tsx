import { useHeaderHeight } from "expo-router/react-navigation";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** A scrollable form that stays above the keyboard and clear of the home indicator. */
export function FormScreen({ children }: { children: ReactNode }) {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      // Android draws edge to edge, so the window no longer resizes for the keyboard on its own.
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
      className="flex-1 bg-white"
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-4 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
