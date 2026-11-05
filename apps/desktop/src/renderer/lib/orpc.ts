import { createORPCClient, ORPCError } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";

import type { RendererContract } from "../../shared/ipc.ts";
import { createBridgeLink } from "./bridge-link.ts";

/** Typed client for the renderer contract. Session procedures are not on it; see `session.ts`. */
export const client: ContractRouterClient<RendererContract> = createORPCClient(
  createBridgeLink(window.desktop.rpc),
);

export const orpc = createTanstackQueryUtils(client);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // A 4xx will not change on retry; network and server errors might.
      retry: (failureCount, error) =>
        failureCount < 2 && !(error instanceof ORPCError && error.status < 500),
    },
  },
});
