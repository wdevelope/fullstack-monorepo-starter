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

/** Where native clients keep the refresh token (Keychain/Keystore, Electron safeStorage, ...). */
export interface RefreshTokenStore {
  get(): Promise<string | null>;
  set(token: string | null): Promise<void>;
}

export interface ApiClientOptions {
  /** Base URL of the RPC endpoint, e.g. `http://localhost:3000/rpc`. */
  url: string;
  clientKind: ClientKind;
  /** Required for native clients. Web clients keep the refresh token in an HttpOnly cookie. */
  refreshTokenStore?: RefreshTokenStore;
  fetch?: typeof globalThis.fetch;
}

export interface ApiClient {
  /** Typed client for every procedure. Calls retry once after a silent token refresh. */
  api: Api;
  /** The signed-in user, or null. Stable between changes, so it works with useSyncExternalStore. */
  getUser(): User | null;
  subscribe(listener: () => void): () => void;
  /** Restores a session at startup from the cookie (web) or the stored refresh token (native). */
  restore(): Promise<User | null>;
  signUp(input: { email: string; password: string; nickname: string }): Promise<User>;
  signIn(input: { email: string; password: string }): Promise<User>;
  signOut(): Promise<void>;
}

/** Procedures that create or end a session. Their 401s are answers, not an expired token. */
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
    throw new Error("Native clients need a refreshTokenStore");
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
    // Browsers only send the refresh cookie on cross-origin calls when credentials are included.
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
   * Refreshes at most once at a time: when several calls hit an expired token together, they all
   * wait for the same refresh. The server treats a reused refresh token as theft, so sending it
   * twice would sign the user out.
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
        // Sign out locally even if the server is unreachable.
        await clearSession();
      }
    },
  };
}

export { watchNotifications, type WatchNotificationsOptions } from "./notifications.ts";
