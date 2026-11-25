/** 앱 안의 화면. 앱은 창 하나에 URL이 없으므로 평범한 상태로 충분하다. */
export type View =
  | { name: "posts" }
  | { name: "post"; id: string }
  | { name: "new-post"; workspaceId?: string }
  | { name: "workspaces" }
  | { name: "workspace"; id: string }
  | { name: "workspace-members"; id: string }
  | { name: "notifications" }
  | { name: "edit-post"; id: string }
  | { name: "sign-in" }
  | { name: "sign-up" };

export type Navigate = (view: View) => void;
