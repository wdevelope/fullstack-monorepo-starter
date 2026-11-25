import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createApiClient } from "@starter/api-client";
import { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

const apiUrl = import.meta.env.VITE_API_URL || `${window.location.origin}/rpc`;

/** 탭마다 세션이 하나다. 리프레시 토큰은 페이지가 읽을 수 없는 HttpOnly 쿠키에 있다. */
export const client = createApiClient({ url: apiUrl, clientKind: "web" });

export const orpc = createTanstackQueryUtils(client.api);

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

export function useUser() {
  return useSyncExternalStore(client.subscribe, client.getUser);
}
