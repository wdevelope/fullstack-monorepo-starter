import type { ClientLink } from "@orpc/client";

import { unwrapIpcResult } from "../../shared/ipc-errors.ts";
import type { DesktopBridge } from "../../shared/ipc.ts";

/** An oRPC link that hands every call to the main process; the renderer itself has no network. */
export function createBridgeLink(rpc: DesktopBridge["rpc"]): ClientLink<Record<never, never>> {
  return {
    // The abort signal cannot cross IPC. A cancelled query simply ignores the late result.
    async call(path, input) {
      return unwrapIpcResult(await rpc(path.join("."), input));
    },
  };
}
