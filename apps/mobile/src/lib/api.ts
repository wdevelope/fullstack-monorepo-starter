import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createApiClient } from "@starter/api-client";
import { focusManager, QueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";

import { createRefreshTokenStore } from "../session/refresh-token-store";
import { shouldRetry } from "./errors";

// Inlined at build time. Android emulators reach the host at 10.0.2.2, devices need its LAN IP.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/rpc";

/** The one API client of the app. It owns the session and refreshes tokens on its own. */
export const client = createApiClient({
  url: API_URL,
  clientKind: "native",
  refreshTokenStore: createRefreshTokenStore(SecureStore),
});

export const orpc = createTanstackQueryUtils(client.api);

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetry, staleTime: 30_000 } },
});

const RESTORE_WAIT_MS = 5_000;

/**
 * Settles once the stored refresh token was tried at launch, or after a few seconds. An unreachable
 * server or a Keychain failure must not hold the splash screen: the app opens signed out (reading
 * needs no account), and a restore that finishes late still signs the user in through subscribe().
 */
export const sessionRestored = Promise.race([
  client.restore().catch((error: unknown) => {
    console.warn("Could not restore the session", error);
    return null;
  }),
  new Promise<null>((resolve) => setTimeout(() => resolve(null), RESTORE_WAIT_MS)),
]);

// likedByMe and the author-only actions depend on who is signed in, so refetch when that changes.
// Token refreshes hand out a new user object for the same person; those are ignored.
let signedInUserId = client.getUser()?.id ?? null;
client.subscribe(() => {
  const next = client.getUser()?.id ?? null;
  if (next === signedInUserId) return;
  signedInUserId = next;
  void queryClient.invalidateQueries();
});

// React Native has no window focus event; refetch stale queries when the app comes to the foreground.
if (Platform.OS !== "web") {
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener("change", (state) =>
      setFocused(state === "active"),
    );
    return () => subscription.remove();
  });
}
