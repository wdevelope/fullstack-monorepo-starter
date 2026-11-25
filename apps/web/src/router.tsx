import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";

import { client } from "./lib/api.ts";
import { safeRedirect } from "./lib/errors.ts";
import { Layout } from "./routes/layout.tsx";
import { LoginPage, SignupPage } from "./routes/auth.tsx";
import { PostEditorPage } from "./routes/post-editor.tsx";
import { PostListPage } from "./routes/post-list.tsx";
import { PostPage } from "./routes/post.tsx";
import { WorkspaceListPage, WorkspaceMembersPage, WorkspacePage } from "./routes/workspaces.tsx";

const rootRoute = createRootRoute({ component: Layout });

/** 로그인이 필요한 페이지는 로그인하지 않은 사용자를 /login으로 보내고, 로그인 뒤 다시 돌아오게 한다. */
function requireUser({ location }: { location: { href: string } }) {
  if (!client.getUser()) throw redirect({ to: "/login", search: { redirect: location.href } });
}

const authSearch = (search: Record<string, unknown>) => ({
  redirect: safeRedirect(search.redirect),
});

const workspaceRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/workspaces",
    beforeLoad: requireUser,
    component: WorkspaceListPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/workspaces/$workspaceId",
    beforeLoad: requireUser,
    component: WorkspacePage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/workspaces/$workspaceId/members",
    beforeLoad: requireUser,
    component: WorkspaceMembersPage,
  }),
];

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: PostListPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    validateSearch: authSearch,
    component: LoginPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/signup",
    validateSearch: authSearch,
    component: SignupPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/posts/new",
    beforeLoad: requireUser,
    // 워크스페이스에서 글을 쓸 때 정해진다. 공개 게시판이면 없다.
    validateSearch: (search: Record<string, unknown>) => ({
      workspaceId: typeof search.workspaceId === "string" ? search.workspaceId : undefined,
    }),
    component: PostEditorPage,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/posts/$postId", component: PostPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/posts/$postId/edit",
    beforeLoad: requireUser,
    component: PostEditorPage,
  }),
  ...workspaceRoutes,
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
