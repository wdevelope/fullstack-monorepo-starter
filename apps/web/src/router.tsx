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

/** Pages that need a signed-in user send everyone else to /login and back afterwards. */
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
    // Set when writing in a workspace; absent for the public board.
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
