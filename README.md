# Fullstack Monorepo Starter

[![CI](https://github.com/wdevelope/fullstack-monorepo-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/wdevelope/fullstack-monorepo-starter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

One TypeScript contract, four apps: an API server, a web app, a desktop app and a mobile app. All of them share one typed API definition and one session client.

The sample features are real enough to copy into production: **email/password auth with rotating refresh tokens and reuse detection**, a **community board** (posts, comments, likes), **workspaces** with roles and members-only boards, and **live notifications** over Server-Sent Events that fan out across server instances through PostgreSQL `LISTEN/NOTIFY`. Each is one vertical slice from contract to every client.

The repo also has a **development harness** for AI-assisted work: specs with scenario IDs, test-first edit guards for Claude Code, a commit guard and CI that checks every scenario has a test.

| Layer    | Stack                                                                          |
| -------- | ------------------------------------------------------------------------------ |
| Contract | [oRPC](https://orpc.dev) contract-first API, Zod 4                             |
| Server   | Hono, oRPC, Drizzle ORM, PostgreSQL 16, Node.js type stripping (no build step) |
| Web      | Vite, React 19, TanStack Router + Query, Tailwind CSS v4                       |
| Desktop  | Electron, electron-vite, React 19, TanStack Query                              |
| Mobile   | Expo SDK 57, Expo Router, NativeWind, SecureStore                              |
| Tooling  | pnpm workspaces + catalog, Turborepo, ESLint (custom boundary rule), Vitest    |

## Architecture

```mermaid
flowchart LR
  subgraph packages
    contracts["contracts<br/>oRPC procedures + Zod schemas"]
    client["api-client<br/>session, single-flight refresh"]
  end
  web["web<br/>(cookie session)"] --> client
  mobile["mobile<br/>(SecureStore)"] --> client
  renderer["desktop renderer<br/>(no network)"] -- "typed IPC" --> main["desktop main<br/>(safeStorage)"]
  main --> client
  client --> contracts
  server["server<br/>Hono + oRPC + Drizzle"] --> contracts
  client -- "HTTP /rpc" --> server
  server --> db[(PostgreSQL)]
  db -- "NOTIFY → SSE" --> server
```

- **One contract.** `packages/contracts` defines every procedure, its Zod input/output and its typed errors (`EMAIL_TAKEN`, `ACCOUNT_LOCKED { retryAfterSeconds }`, ...). The server implements it with `implement(contract)`; clients get full types and the same schemas for form validation.
- **One session client.** `packages/api-client` keeps the access token in memory, stores the refresh token where each platform keeps secrets, and refreshes **once** when several calls hit an expired token at the same time.
- **Hard boundaries.** Apps never import each other; they share code only through `packages/`. A custom ESLint rule ([`tooling/eslint/boundaries.mjs`](tooling/eslint/boundaries.mjs)) fails the build otherwise.

## Auth, done properly

| Concern              | How it is handled                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password storage     | scrypt at OWASP cost (N=2¹⁷), per-user salt, constant-time compare. The cost is stored in each hash so it can rise later.                            |
| Access tokens        | 15-minute HS256 JWT. The audience is the client kind, so a web token is rejected when replayed from a native client.                                 |
| Refresh tokens       | 256-bit random, only the SHA-256 hash is stored, 14-day expiry, rotated on every use.                                                                |
| Stolen refresh token | Presenting an already-used token revokes the whole token family (reuse detection). A guarded `UPDATE` lets only one of two concurrent refreshes win. |
| Brute force          | Five consecutive failures lock the account for 15 minutes (`ACCOUNT_LOCKED` with `retryAfterSeconds`).                                               |
| User enumeration     | Unknown email and wrong password return the same error and take the same time (dummy hash check).                                                    |
| Web storage          | Refresh token in an `HttpOnly; SameSite=Strict; Path=/rpc/auth` cookie the page cannot read.                                                         |
| CSRF                 | The cookie is honoured only with the `x-client-kind: web` header, which a cross-site form cannot send.                                               |
| Native storage       | iOS Keychain / Android Keystore (SecureStore) on mobile, OS-encrypted `safeStorage` on desktop.                                                      |
| Desktop renderer     | Sandboxed, context-isolated, no network and no tokens. The main process makes every API call through a typed IPC allowlist.                          |

```mermaid
sequenceDiagram
  participant App as Client (api-client)
  participant API as Server
  App->>API: posts.create (access token expired)
  API-->>App: 401 UNAUTHORIZED
  App->>API: auth.refresh (refresh token R1)
  API->>API: revoke R1, issue R2 in the same family
  API-->>App: new access token + R2
  App->>API: posts.create (retried once)
  API-->>App: 200
  Note over App,API: If R1 is ever presented again, the server revokes the whole family (R2 included)
```

The full rules and scenarios are in [`docs/specs/auth.md`](docs/specs/auth.md).

## Community board

Posts, comments and likes ([`docs/specs/community.md`](docs/specs/community.md)):

- **Keyset pagination** on `(created_at, id)` with an opaque cursor, so pages stay stable while new posts arrive. Timestamps are stored at millisecond precision so cursors round-trip exactly.
- **Idempotent likes** enforced by a composite primary key with `ON CONFLICT DO NOTHING`.
- **Author-only edits** done in a single `UPDATE ... WHERE id = $1 AND author_id = $2`, then a lookup only to tell `NOT_FOUND` from `FORBIDDEN`.
- **Cascading deletes** for comments and likes.

## Workspaces

Private team boards with roles `owner`, `admin` and `member` ([`docs/specs/workspaces.md`](docs/specs/workspaces.md)):

- **Resource-level authorization.** Every read and write carries the caller's membership as an `EXISTS` in the same SQL statement (`INSERT ... SELECT` from the membership row, `UPDATE/DELETE ... WHERE EXISTS`), so there is no check-then-act gap and access ends the moment a member is removed.
- **No existence leaks.** Non-members get `NOT_FOUND`, never `FORBIDDEN`, for the workspace, its post list, its posts, comments and likes.
- **Moderation.** Workspace admins and the owner can delete anyone's posts and comments there; editing stays author-only. One owner per workspace is enforced by a partial unique index.

## Live notifications

Comments and likes on your posts land in an inbox with an unread count, and every open client gets them live ([`docs/specs/notifications.md`](docs/specs/notifications.md)):

```mermaid
sequenceDiagram
  participant B as Bob's client
  participant S1 as Server instance 1
  participant PG as PostgreSQL
  participant S2 as Server instance 2
  participant A as Alice's client
  A->>S2: notifications.stream (SSE, access token)
  S2->>PG: LISTEN notifications (one connection per instance, at startup)
  S2-->>A: ready { unreadCount }
  B->>S1: comments.create
  S1->>PG: BEGIN; INSERT comment; INSERT notification; SELECT pg_notify(...); COMMIT
  PG-->>S1: NOTIFY { id, recipientId }
  PG-->>S2: NOTIFY { id, recipientId }
  S2->>PG: load notification WHERE id AND recipient = Alice
  S2-->>A: notification { ..., unreadCount }
  Note over S2,A: The stream ends when the access token expires; the client refreshes and reconnects
```

- **Same transaction.** The notification is written with the comment or like. `pg_notify` runs inside the transaction, and PostgreSQL delivers it only after commit, so no instance hears about a row that was rolled back.
- **Any instance.** Each server process holds one `LISTEN` connection ([`notification-hub.ts`](apps/server/src/platform/notification-hub.ts)) and fans messages out to its own open streams, keyed by recipient.
- **Bounded by the session.** The stream ends at access-token expiry; `watchNotifications` in `@starter/api-client` refreshes once and reopens, and backs off on network errors. A revoked session stops receiving within one token lifetime.
- **Idempotent likes.** A partial unique index on `(post_id, actor_id) WHERE type = 'like'` with `ON CONFLICT DO NOTHING` notifies once per liker and post.
- **Clients.** Web shows a live bell; desktop main owns the stream, forwards events over IPC and shows a system notification; mobile refreshes the inbox and badge on focus (no live stream yet).

## Development workflow

Behaviour is written down before it is built, and the tooling checks that it stays that way.

1. **Spec**: `docs/specs/<feature>.md` lists rules and scenarios with IDs (`AUTH-1` … `AUTH-17`, `COM-1` … `COM-11`, `WS-1` … `WS-11`, `NOTI-1` … `NOTI-9`).
2. **Test**: every scenario gets a test whose title starts with its ID: `it("AUTH-9 revokes the whole family when a rotated token is reused")`.
3. **Code**: the smallest change that passes.

| Guard                                              | Runs                     | Checks                                                                                                  |
| -------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| [`spec-check`](tooling/harness/spec-check.mjs)     | pre-commit, CI           | Every scenario of a `Done` spec has a test; no test names an unknown scenario                           |
| [`commit-guard`](tooling/harness/commit-guard.mjs) | pre-commit, commit-msg   | `as any`, `@ts-ignore`, `.only`, reasonless `eslint-disable`, secrets, edited migrations, commit format |
| [`edit-guard`](.claude/hooks/edit-guard.mjs)       | Claude Code `PreToolUse` | Blocks logic edits until a test in the same workspace changed; blocks secrets and committed migrations  |
| [`boundaries`](tooling/eslint/boundaries.mjs)      | ESLint                   | Apps import only `packages/*`, never each other                                                         |
| [Skills](.claude/skills)                           | Claude Code              | `spec` (write and approve a spec) and `implement` (test-first vertical slice)                           |

The guards have their own tests (`pnpm test:tooling`).

## Getting started

Requirements: Node.js 22.18+ (see `.nvmrc`), pnpm 10, Docker.

```bash
pnpm install
pnpm db:up
cp apps/server/.env.example apps/server/.env   # then set JWT_SECRET
```

```bash
pnpm --filter @starter/server db:migrate
```

```bash
pnpm dev
```

The server runs on http://localhost:3000 and the web app on http://localhost:5173 (Vite proxies `/rpc`, so the session cookie is first-party in development). Desktop and mobile have their own READMEs: [`apps/desktop`](apps/desktop/README.md), [`apps/mobile`](apps/mobile/README.md).

### Checks

```bash
pnpm lint          # ESLint (with boundary rule) + Prettier
pnpm spec:check    # specs ↔ tests
pnpm test:tooling  # tests for the guards themselves
pnpm typecheck
pnpm test          # server tests need Postgres (TEST_DATABASE_URL)
```

## Project structure

```
apps/
  server/      Hono + oRPC API, Drizzle schema and migrations, integration tests on Postgres
  web/         React web client
  desktop/     Electron client (main / preload / renderer)
  mobile/      Expo client
packages/
  contracts/   oRPC contract and Zod schemas shared by everything
  api-client/  typed client with session handling and token refresh
docs/specs/    feature specs with scenario IDs
tooling/       ESLint boundary rule, harness scripts, git hooks
.claude/       Claude Code hooks and skills
```

## Not included (yet)

Email verification, password reset, per-IP rate limiting, file uploads and browser end-to-end tests in CI. Each would start as a spec in `docs/specs`.

## License

[MIT](LICENSE)
