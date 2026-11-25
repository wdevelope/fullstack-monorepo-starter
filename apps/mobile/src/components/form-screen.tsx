import { useHeaderHeight } from "expo-router/react-navigation";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** 키보드 위에 머물고 홈 인디케이터를 가리지 않는 스크롤 폼. */
export function FormScreen({ children }: { children: ReactNode }) {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      // Android는 화면 끝까지(edge to edge) 그리므로, 창이 키보드에 맞춰 스스로 크기를 바꾸지 않는다.
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
