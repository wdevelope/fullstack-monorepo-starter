import "../global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Suspense, use, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { TextButton } from "../src/components/button";
import { queryClient, sessionRestored } from "../src/lib/api";
import { leave } from "../src/lib/navigation";

const cancelButton = () => <TextButton title="Cancel" onPress={() => leave()} />;
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
            <Stack.Screen name="index" options={{ title: "Community" }} />
            <Stack.Screen name="posts/[id]/index" options={{ title: "Post" }} />
            <Stack.Screen name="posts/[id]/edit" options={{ ...modal, title: "Edit post" }} />
            <Stack.Screen name="posts/new" options={{ ...modal, title: "New post" }} />
            <Stack.Screen name="workspaces/index" options={{ title: "Workspaces" }} />
            <Stack.Screen name="workspaces/[id]" options={{ title: "Workspace" }} />
            <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
            <Stack.Screen name="sign-in" options={{ ...modal, title: "Sign in" }} />
            <Stack.Screen name="sign-up" options={{ ...modal, title: "Create account" }} />
          </Stack>
        </AfterSessionRestore>
      </Suspense>
    </QueryClientProvider>
  );
}

/** Holds the navigator back until the stored session was tried, so screens never flash signed out. */
function AfterSessionRestore({ children }: { children: ReactNode }) {
  use(sessionRestored);
  return children;
}

function Splash() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white">
      <Text className="text-2xl font-bold text-neutral-900">Starter</Text>
      <ActivityIndicator color="#737373" />
    </View>
  );
}
