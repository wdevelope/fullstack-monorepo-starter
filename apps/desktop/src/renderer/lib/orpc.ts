import { createORPCClient, ORPCError } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";

import type { RendererContract } from "../../shared/ipc.ts";
import { createBridgeLink } from "./bridge-link.ts";

/** 렌더러 계약의 타입 있는 클라이언트. 세션 절차는 여기에 없다. `session.ts`를 본다. */
export const client: ContractRouterClient<RendererContract> = createORPCClient(
  createBridgeLink(window.desktop.rpc),
);

export const orpc = createTanstackQueryUtils(client);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // 4xx는 다시 시도해도 바뀌지 않는다. 네트워크·서버 오류는 바뀔 수 있다.
      retry: (failureCount, error) =>
        failureCount < 2 && !(error instanceof ORPCError && error.status < 500),
    },
  },
});
