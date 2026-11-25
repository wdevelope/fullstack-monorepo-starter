import { createORPCClient, ORPCError, type ClientLink } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import {
  CLIENT_KIND_HEADER,
  type ClientKind,
  type Contract,
  type Session,
  type User,
} from "@starter/contracts";

export type Api = ContractRouterClient<Contract>;

/** 네이티브 클라이언트가 리프레시 토큰을 두는 곳이다(Keychain/Keystore, Electron safeStorage 등). */
export interface RefreshTokenStore {
  get(): Promise<string | null>;
  set(token: string | null): Promise<void>;
}

export interface ApiClientOptions {
  /** RPC 엔드포인트의 기본 URL이다. 예: `http://localhost:3000/rpc`. */
  url: string;
  clientKind: ClientKind;
  /** 네이티브 클라이언트에는 꼭 필요하다. 웹 클라이언트는 리프레시 토큰을 HttpOnly 쿠키에 둔다. */
  refreshTokenStore?: RefreshTokenStore;
  fetch?: typeof globalThis.fetch;
}

export interface ApiClient {
  /** 모든 절차를 부르는 타입 있는 클라이언트다. 호출은 토큰을 조용히 리프레시한 뒤 한 번 다시 시도한다. */
  api: Api;
  /** 로그인한 사용자이고, 없으면 null이다. 바뀌기 전까지 같은 값이므로 useSyncExternalStore와 함께 쓸 수 있다. */
  getUser(): User | null;
  subscribe(listener: () => void): () => void;
  /** 시작할 때 쿠키(웹)나 저장한 리프레시 토큰(네이티브)으로 세션을 복원한다. */
  restore(): Promise<User | null>;
  signUp(input: { email: string; password: string; nickname: string }): Promise<User>;
  signIn(input: { email: string; password: string }): Promise<User>;
  signOut(): Promise<void>;
}

/** 세션을 만들거나 끝내는 절차다. 이들의 401은 만료된 토큰이 아니라 그 자체로 응답이다. */
const SESSION_PROCEDURES = new Set(["auth.signup", "auth.login", "auth.refresh", "auth.logout"]);

function isUnauthorized(error: unknown) {
  return error instanceof ORPCError && error.code === "UNAUTHORIZED";
}

function isRejectedRefresh(error: unknown) {
  return error instanceof ORPCError && error.code === "INVALID_REFRESH_TOKEN";
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { clientKind, refreshTokenStore } = options;
  if (clientKind === "native" && !refreshTokenStore) {
    throw new Error("네이티브 클라이언트에는 refreshTokenStore가 필요하다");
  }
  const baseFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  let accessToken: string | null = null;
  let user: User | null = null;
  let refreshing: Promise<boolean> | null = null;
  const listeners = new Set<() => void>();

  const transport = new RPCLink({
    url: options.url,
    headers: () => ({
      [CLIENT_KIND_HEADER]: clientKind,
      ...(accessToken && { authorization: `Bearer ${accessToken}` }),
    }),
    // 브라우저는 credentials를 포함할 때만 교차 출처 호출에 리프레시 쿠키를 보낸다.
    fetch: (request, init) => baseFetch(request, { ...init, credentials: "include" }),
  });

  function setUser(next: User | null) {
    if (next === user) return;
    user = next;
    for (const listener of listeners) listener();
  }

  async function applySession(session: Session): Promise<User> {
    accessToken = session.accessToken;
    if (clientKind === "native") await refreshTokenStore!.set(session.refreshToken ?? null);
    setUser(session.user);
    return session.user;
  }

  async function clearSession() {
    accessToken = null;
    if (clientKind === "native") await refreshTokenStore!.set(null);
    setUser(null);
  }

  const raw: Api = createORPCClient(transport);

  /**
   * 한 번에 하나만 리프레시한다. 여러 호출이 함께 만료된 토큰을 만나면 모두 같은 리프레시를
   * 기다린다. 서버는 재사용된 리프레시 토큰을 도난으로 보므로, 두 번 보내면 사용자가 로그아웃된다.
   */
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      try {
        const stored = clientKind === "native" ? await refreshTokenStore!.get() : undefined;
        if (clientKind === "native" && !stored) {
          await clearSession();
          return false;
        }
        await applySession(await raw.auth.refresh({ refreshToken: stored ?? undefined }));
        return true;
      } catch (error) {
        if (!isRejectedRefresh(error)) throw error;
        await clearSession();
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  const retryingLink: ClientLink<Record<never, never>> = {
    async call(path, input, callOptions) {
      try {
        return await transport.call(path, input, callOptions);
      } catch (error) {
        if (SESSION_PROCEDURES.has(path.join(".")) || !accessToken || !isUnauthorized(error)) {
          throw error;
        }
        if (!(await refresh())) throw error;
        return transport.call(path, input, callOptions);
      }
    },
  };

  return {
    api: createORPCClient(retryingLink),
    getUser: () => user,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async restore() {
      return (await refresh()) ? user : null;
    },
    async signUp(input) {
      return applySession(await raw.auth.signup(input));
    },
    async signIn(input) {
      return applySession(await raw.auth.login(input));
    },
    async signOut() {
      const stored = clientKind === "native" ? await refreshTokenStore!.get() : null;
      try {
        await raw.auth.logout({ refreshToken: stored ?? undefined });
      } finally {
        // 서버에 닿지 않아도 기기에서는 로그아웃한다.
        await clearSession();
      }
    },
  };
}

export { watchNotifications, type WatchNotificationsOptions } from "./notifications.ts";
