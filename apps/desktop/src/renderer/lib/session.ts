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
  // 글에는 묻는 사람에 따라 달라지는 `likedByMe`가 있다.
  const userId = next.status === "ready" ? next.user?.id : undefined;
  if (userId !== previousUserId) void queryClient.invalidateQueries();
}

function setUser(user: User | null) {
  setState({ status: "ready", user, restoreError: null });
}

// 메인도 스스로 세션을 바꾼다. 예를 들어 서버가 리프레시 토큰을 거부하면 로그아웃한다.
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
  // 서버에 닿지 못해도 메인이 세션을 지우므로 결과를 처리할 필요가 없다.
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
