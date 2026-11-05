# @starter/desktop

Electron client for the community board, workspaces and notifications (Electron 44, electron-vite, React 19, TanStack Query, Tailwind v4). The main process owns the session and talks to the API; the renderer is a sandboxed page with no network access.

## Run

```bash
pnpm db:up && pnpm --filter @starter/server db:migrate
pnpm --filter @starter/server dev     # API on http://localhost:3000/rpc
pnpm --filter @starter/desktop dev    # downloads the Electron binary on first run

STARTER_API_URL=https://api.example.com/rpc pnpm --filter @starter/desktop dev   # another server

pnpm --filter @starter/desktop package   # dmg / nsis / AppImage in release/
```

`typecheck`, `test` and `build` work without the Electron binary. Tests cover the pure main-process modules and never import `electron`.

## Layout

| Path            | Runs in                       | What it does                                                        |
| --------------- | ----------------------------- | ------------------------------------------------------------------- |
| `src/main/`     | Main process (Node)           | Window, hardening, IPC handlers, api client, token store            |
| `src/preload/`  | Sandboxed preload             | Exposes `window.desktop`: the session bridge and `rpc(path, input)` |
| `src/shared/`   | Both                          | IPC channel names, bridge types, error (de)serialisation            |
| `src/renderer/` | Sandboxed renderer (Chromium) | The React app. Calls the API through an oRPC link over the bridge   |

## Security model

- **Locked-down renderer.** `contextIsolation`, `sandbox` and no `nodeIntegration`. `window.open`, navigation away from the app page, `<webview>` and permission requests are all refused, for every web contents.
- **No network in the renderer.** The production CSP is `default-src 'none'` with `connect-src 'none'`; scripts and styles load only from the bundle. Every API call goes through `window.desktop.rpc` to main, which uses `@starter/api-client` with `clientKind: "native"`.
- **Tokens stay in main.** The access token lives in main's memory. The refresh token is encrypted with `safeStorage` in `userData/session.bin` and is only handed back for the server that issued it. Without OS encryption (including Linux's `basic_text` fallback) it is kept in memory only, never written in plaintext. The bridge returns users, never tokens.
- **Narrow, validated IPC.** Each bridge method has one fixed channel, and main rejects calls from any frame that is not the app page. `rpc` accepts only `auth.me`, `posts.*`, `comments.*`, `workspaces.*` and `notifications.list`/`unreadCount`/`markRead`; signup, login, refresh and logout are rejected, and the renderer's client type does not even offer them. Main parses every input with the contract's Zod schema before sending it. Errors come back as plain data and are rebuilt as `ORPCError` in the renderer.
- **One refresh at a time.** A single-instance lock stops two app instances from rotating the same refresh token, which the server would treat as theft and revoke.
- **Hardened packages.** Release builds flip Electron fuses (no `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` or `--inspect`; code only from `app.asar`) and ignore `ELECTRON_RENDERER_URL`. Main and preload are fully bundled, so no `node_modules` ship.
- **Notifications stay in main.** `notifications.stream` is not an `rpc` call. Main keeps the SSE stream open while a user is signed in (`src/main/notification-forwarder.ts`, using `watchNotifications`), restarts it when the user changes, forwards each event to the renderer on its own IPC channel (`notifications:event`) and shows an Electron `Notification` itself, so the renderer still gets no network and no notification permission.
