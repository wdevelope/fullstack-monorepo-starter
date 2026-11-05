import type { User } from "@starter/contracts";
import { useSyncExternalStore } from "react";

import { client } from "../lib/api";

/** The signed-in user, or null. Re-renders on sign-in, sign-out and a rejected refresh. */
export function useUser(): User | null {
  return useSyncExternalStore(client.subscribe, client.getUser);
}
