import "../global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Suspense, use, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { TextButton } from "../src/components/button";
import { queryClient, sessionRestored } from "../src/lib/api";
import { leave } from "../src/lib/navigation";

const cancelButton = () => <TextButton title="취소" onPress={() => leave()} />;
const modal = { presentation: "modal", headerLeft: cancelButton } as const;

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Suspense fallback={<Splash />}>
        <AfterSessionRestore>
          <Stack
            screenOptions={{
              headerShadowVisible: false,
              headerTintColor: "#171717",
              headerBackButtonDisplayMode: "minimal",
              contentStyle: { backgroundColor: "#ffffff" },
            }}
          >
            <Stack.Screen name="index" options={{ title: "공개 게시판" }} />
            <Stack.Screen name="posts/[id]/index" options={{ title: "글" }} />
            <Stack.Screen name="posts/[id]/edit" options={{ ...modal, title: "글 수정" }} />
            <Stack.Screen name="posts/new" options={{ ...modal, title: "글쓰기" }} />
            <Stack.Screen name="workspaces/index" options={{ title: "워크스페이스" }} />
            <Stack.Screen name="workspaces/[id]" options={{ title: "워크스페이스" }} />
            <Stack.Screen name="notifications" options={{ title: "알림" }} />
            <Stack.Screen name="sign-in" options={{ ...modal, title: "로그인" }} />
            <Stack.Screen name="sign-up" options={{ ...modal, title: "회원가입" }} />
          </Stack>
        </AfterSessionRestore>
      </Suspense>
    </QueryClientProvider>
  );
}

/** 저장된 세션을 시도해 볼 때까지 내비게이터를 붙잡아 두어, 화면이 잠깐 로그아웃 상태로 보이지 않게 한다. */
function AfterSessionRestore({ children }: { children: ReactNode }) {
  use(sessionRestored);
  return children;
}

function Splash() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white">
      <Text className="text-2xl font-bold text-neutral-900">커뮤니티</Text>
      <ActivityIndicator color="#737373" />
    </View>
  );
}
