import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createApiClient } from "@starter/api-client";
import { focusManager, QueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";

import { createRefreshTokenStore } from "../session/refresh-token-store";
import { shouldRetry } from "./errors";

// 빌드할 때 인라인된다. Android 에뮬레이터는 10.0.2.2로 호스트에 닿고, 실기기는 호스트의 LAN IP가 필요하다.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/rpc";

/** 앱의 유일한 API 클라이언트. 세션을 소유하고 토큰을 스스로 갱신한다. */
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
 * 실행 시 저장된 리프레시 토큰을 시도해 보면, 또는 몇 초가 지나면 결정된다. 서버에 닿지 않거나
 * Keychain이 실패해도 스플래시 화면을 붙잡아 두면 안 된다. 앱은 로그아웃 상태로 열리고(읽기에는
 * 계정이 필요 없다), 늦게 끝난 복원도 subscribe()를 통해 사용자를 로그인시킨다.
 */
export const sessionRestored = Promise.race([
  client.restore().catch((error: unknown) => {
    console.warn("Could not restore the session", error);
    return null;
  }),
  new Promise<null>((resolve) => setTimeout(() => resolve(null), RESTORE_WAIT_MS)),
]);

// likedByMe와 작성자 전용 동작은 누가 로그인했는지에 달려 있으므로, 그게 바뀌면 다시 불러온다.
// 토큰 갱신은 같은 사람에게 새 user 객체를 주는데, 이런 경우는 무시한다.
let signedInUserId = client.getUser()?.id ?? null;
client.subscribe(() => {
  const next = client.getUser()?.id ?? null;
  if (next === signedInUserId) return;
  signedInUserId = next;
  void queryClient.invalidateQueries();
});

// React Native에는 창 포커스 이벤트가 없다. 앱이 포그라운드로 오면 오래된 쿼리를 다시 불러온다.
if (Platform.OS !== "web") {
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener("change", (state) =>
      setFocused(state === "active"),
    );
    return () => subscription.remove();
  });
}
