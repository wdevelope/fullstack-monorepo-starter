import type { User } from "@starter/contracts";
import { useSyncExternalStore } from "react";

import { deserializeError, unwrapIpcResult } from "../../shared/ipc-errors.ts";
import type { SignInInput, SignUpInput } from "../../shared/ipc.ts";
import { queryClient } from "./orpc.ts";

export type SessionState =
  { status: "restoring" } | { status: "ready"; user: User | null; restoreError: Error | null };

const bridge = window.desktop.session;
const listeners = new Set<() => void>();
let state: SessionState = { status: "restoring" };

function setState(next: SessionState) {
  const previousUserId = state.status === "ready" ? state.user?.id : undefined;
  state = next;
  for (const listener of listeners) listener();
  // Posts carry `likedByMe`, which depends on who is asking.
  const userId = next.status === "ready" ? next.user?.id : undefined;
  if (userId !== previousUserId) void queryClient.invalidateQueries();
}

function setUser(user: User | null) {
  setState({ status: "ready", user, restoreError: null });
}

// Main also changes the session on its own, e.g. it signs out when the server rejects the refresh token.
bridge.onUserChange(setUser);

export async function restoreSession() {
  setState({ status: "restoring" });
  const result = await bridge.restore();
  setState(
    result.ok
      ? { status: "ready", user: result.data, restoreError: null }
      : { status: "ready", user: null, restoreError: deserializeError(result.error) },
  );
}

export async function signIn(input: SignInInput) {
  setUser(unwrapIpcResult(await bridge.signIn(input)));
}

export async function signUp(input: SignUpInput) {
  setUser(unwrapIpcResult(await bridge.signUp(input)));
}

export async function signOut() {
  // Main clears the session even when the server is unreachable, so the result needs no handling.
  await bridge.signOut();
  setUser(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => state);
}
