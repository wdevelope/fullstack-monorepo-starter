import type { User } from "@starter/contracts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button, ErrorNotice, Muted } from "./components/ui.tsx";
import { AuthScreen } from "./features/auth/AuthScreen.tsx";
import { EditPostScreen, NewPostScreen } from "./features/posts/PostEditorScreen.tsx";
import { PostListScreen } from "./features/posts/PostListScreen.tsx";
import {
  NotificationButton,
  NotificationsScreen,
  useLiveNotifications,
} from "./features/notifications/Notifications.tsx";
import { PostScreen } from "./features/posts/PostScreen.tsx";
import {
  WorkspaceListScreen,
  WorkspaceMembersScreen,
  WorkspaceScreen,
} from "./features/workspaces/WorkspaceScreens.tsx";
import { errorMessage } from "./lib/errors.ts";
import type { Navigate, View } from "./lib/navigation.ts";
import { restoreSession, signOut, useSession } from "./lib/session.ts";

function Header({ user, navigate }: { user: User | null; navigate: Navigate }) {
  const leave = useMutation({ mutationFn: signOut, onSuccess: () => navigate({ name: "posts" }) });

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
        <button
          type="button"
          className="text-base font-semibold tracking-tight"
          onClick={() => navigate({ name: "posts" })}
        >
          Community
        </button>
        {user ? (
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate({ name: "workspaces" })}>
              Workspaces
            </Button>
            <NotificationButton navigate={navigate} />
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Signed in as{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{user.nickname}</span>
            </span>
            <Button variant="secondary" disabled={leave.isPending} onClick={() => leave.mutate()}>
              Sign out
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate({ name: "sign-in" })}>
              Sign in
            </Button>
            <Button onClick={() => navigate({ name: "sign-up" })}>Create account</Button>
          </div>
        )}
      </div>
    </header>
  );
}

function Screen({ view, user, navigate }: { view: View; user: User | null; navigate: Navigate }) {
  switch (view.name) {
    case "posts":
      return <PostListScreen user={user} navigate={navigate} />;
    case "post":
      return <PostScreen id={view.id} user={user} navigate={navigate} />;
    case "new-post":
      return <NewPostScreen workspaceId={view.workspaceId} navigate={navigate} />;
    case "workspaces":
      return <WorkspaceListScreen navigate={navigate} />;
    case "workspace":
      return <WorkspaceScreen id={view.id} navigate={navigate} />;
    case "workspace-members":
      return <WorkspaceMembersScreen id={view.id} user={user} navigate={navigate} />;
    case "notifications":
      return <NotificationsScreen navigate={navigate} />;
    case "edit-post":
      return <EditPostScreen id={view.id} navigate={navigate} />;
    case "sign-in":
    case "sign-up":
      return <AuthScreen key={view.name} mode={view.name} navigate={navigate} />;
  }
}

export function App() {
  const session = useSession();
  const [view, setView] = useState<View>({ name: "posts" });
  useLiveNotifications();

  if (session.status === "restoring") {
    return (
      <div className="grid min-h-screen place-items-center bg-zinc-50 dark:bg-zinc-950">
        <Muted>Restoring your session…</Muted>
      </div>
    );
  }

  const { user, restoreError } = session;
  // Writing needs a session. If it ended meanwhile (e.g. the refresh token was rejected), sign in first.
  const needsUser = !["posts", "post", "sign-in", "sign-up"].includes(view.name);
  const current: View = needsUser && !user ? { name: "sign-in" } : view;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <Header user={user} navigate={setView} />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        {restoreError && (
          <ErrorNotice
            message={`Could not restore your session. ${errorMessage(restoreError)}`}
            onRetry={() => void restoreSession()}
          />
        )}
        <Screen view={current} user={user} navigate={setView} />
      </main>
    </div>
  );
}
