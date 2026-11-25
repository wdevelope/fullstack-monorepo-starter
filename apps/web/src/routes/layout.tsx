import { Link, Outlet, useNavigate } from "@tanstack/react-router";

import { Button } from "../components/ui.tsx";
import { client, queryClient, useUser } from "../lib/api.ts";
import { NotificationBell } from "./notifications.tsx";

export function Layout() {
  const user = useUser();
  const navigate = useNavigate();

  async function signOut() {
    await client.signOut().catch(() => {});
    queryClient.clear();
    await navigate({ to: "/" });
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16">
      <header className="flex items-center justify-between py-6">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          커뮤니티
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <Link
                to="/workspaces"
                className="rounded-lg px-2.5 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                워크스페이스
              </Link>
              <NotificationBell userId={user.id} />
              <span className="text-zinc-500">{user.nickname}</span>
              <Button variant="secondary" onClick={signOut}>
                로그아웃
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" search={{ redirect: "/" }}>
                <Button variant="secondary">로그인</Button>
              </Link>
              <Link to="/signup" search={{ redirect: "/" }}>
                <Button>회원가입</Button>
              </Link>
            </>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
