import type { ClientLink } from "@orpc/client";

import { unwrapIpcResult } from "../../shared/ipc-errors.ts";
import type { DesktopBridge } from "../../shared/ipc.ts";

/** 모든 호출을 메인 프로세스에 넘기는 oRPC 링크. 렌더러 자체에는 네트워크가 없다. */
export function createBridgeLink(rpc: DesktopBridge["rpc"]): ClientLink<Record<never, never>> {
  return {
    // abort signal은 IPC를 건널 수 없다. 취소된 쿼리는 늦게 온 결과를 그냥 무시한다.
    async call(path, input) {
      return unwrapIpcResult(await rpc(path.join("."), input));
    },
  };
}
