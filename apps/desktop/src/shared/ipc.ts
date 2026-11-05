import type { ORPCErrorJSON } from "@orpc/client";
import type { Contract, User } from "@starter/contracts";

/** IPC channel names. The preload imports only this module, so it must stay free of runtime deps. */
export const IPC = {
  restore: "session:restore",
  signIn: "session:sign-in",
  signUp: "session:sign-up",
  signOut: "session:sign-out",
  userChanged: "session:user-changed",
  rpc: "rpc:call",
} as const;

/**
 * The procedures the renderer may call through `rpc`. Signup, login, refresh and logout carry
 * tokens, so they never cross IPC; the session bridge wraps them and returns only the user.
 */
export type RendererContract = {
  auth: Pick<Contract["auth"], "me">;
  posts: Contract["posts"];
  comments: Contract["comments"];
};

/** Dotted paths of the renderer contract, e.g. `"posts.list"`. */
export type RpcPath = {
  [N in keyof RendererContract]: `${N}.${Extract<keyof RendererContract[N], string>}`;
}[keyof RendererContract];

/** An `ORPCError` as plain data. Errors thrown in `ipcMain.handle` lose their fields, so we return this instead. */
export type SerializedError = ORPCErrorJSON<string, unknown>;

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: SerializedError };

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput extends SignInInput {
  nickname: string;
}

/** What the preload exposes as `window.desktop`. Nothing here returns or accepts a token. */
export interface DesktopBridge {
  session: {
    restore(): Promise<IpcResult<User | null>>;
    signIn(input: SignInInput): Promise<IpcResult<User>>;
    signUp(input: SignUpInput): Promise<IpcResult<User>>;
    signOut(): Promise<IpcResult<null>>;
    /** Fires whenever main's session changes, including a sign-out caused by a rejected refresh. */
    onUserChange(listener: (user: User | null) => void): () => void;
  };
  rpc(path: string, input: unknown): Promise<IpcResult<unknown>>;
}
