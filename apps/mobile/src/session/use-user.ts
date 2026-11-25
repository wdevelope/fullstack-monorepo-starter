import type { User } from "@starter/contracts";
import { useSyncExternalStore } from "react";

import { client } from "../lib/api";

/** 로그인한 사용자, 없으면 null. 로그인, 로그아웃, 거절된 갱신 때 다시 렌더링한다. */
export function useUser(): User | null {
  return useSyncExternalStore(client.subscribe, client.getUser);
}
