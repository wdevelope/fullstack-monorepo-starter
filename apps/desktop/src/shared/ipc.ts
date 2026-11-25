import type { ORPCErrorJSON } from "@orpc/client";
import type { Contract, NotificationEvent, User } from "@starter/contracts";

/** IPC 채널 이름. preload는 이 모듈만 가져오므로 런타임 의존성이 없어야 한다. */
export const IPC = {
  restore: "session:restore",
  signIn: "session:sign-in",
  signUp: "session:sign-up",
  signOut: "session:sign-out",
  userChanged: "session:user-changed",
  rpc: "rpc:call",
  /** 메인에서 렌더러로: 알림 스트림 이벤트 하나. */
  notification: "notifications:event",
} as const;

/**
 * 렌더러가 `rpc`로 부를 수 있는 절차. 가입·로그인·갱신·로그아웃은 토큰을 실어 나르므로 IPC를
 * 건너지 않는다. 세션 브리지가 이들을 감싸고 사용자만 돌려준다.
 */
export type RendererContract = {
  auth: Pick<Contract["auth"], "me">;
  posts: Contract["posts"];
  comments: Contract["comments"];
  workspaces: Contract["workspaces"];
  /** `stream`은 없다: 스트림은 메인이 갖고 그 이벤트를 `IPC.notification`으로 전달한다. */
  notifications: Pick<Contract["notifications"], "list" | "unreadCount" | "markRead">;
};

/** 렌더러 계약의 점 경로. 예: `"posts.list"`. */
export type RpcPath = {
  [N in keyof RendererContract]: `${N}.${Extract<keyof RendererContract[N], string>}`;
}[keyof RendererContract];

/** 평범한 데이터로 나타낸 `ORPCError`. `ipcMain.handle`에서 던진 오류는 필드를 잃으므로 대신 이것을 돌려준다. */
export type SerializedError = ORPCErrorJSON<string, unknown>;

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: SerializedError };

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput extends SignInInput {
  nickname: string;
}

/** preload가 `window.desktop`으로 노출하는 것. 여기의 어떤 것도 토큰을 돌려주거나 받지 않는다. */
export interface DesktopBridge {
  session: {
    restore(): Promise<IpcResult<User | null>>;
    signIn(input: SignInInput): Promise<IpcResult<User>>;
    signUp(input: SignUpInput): Promise<IpcResult<User>>;
    signOut(): Promise<IpcResult<null>>;
    /** 메인의 세션이 바뀔 때마다 호출된다. 갱신이 거부되어 로그아웃된 경우도 포함한다. */
    onUserChange(listener: (user: User | null) => void): () => void;
  };
  rpc(path: string, input: unknown): Promise<IpcResult<unknown>>;
  /** 메인이 SSE로 받는 실시간 알림 이벤트. */
  onNotification(listener: (event: NotificationEvent) => void): () => void;
}
