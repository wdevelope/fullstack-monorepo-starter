import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createApiClient } from "@starter/api-client";
import { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

const apiUrl = import.meta.env.VITE_API_URL || `${window.location.origin}/rpc`;

/** One session per tab. The refresh token lives in an HttpOnly cookie the page cannot read. */
export const client = createApiClient({ url: apiUrl, clientKind: "web" });

export const orpc = createTanstackQueryUtils(client.api);

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

export function useUser() {
  return useSyncExternalStore(client.subscribe, client.getUser);
}
