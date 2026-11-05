# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## Layout

| Path                  | What it is                                                                |
| --------------------- | ------------------------------------------------------------------------- |
| `packages/contracts`  | oRPC contract + Zod schemas. The only definition of the API.              |
| `packages/api-client` | Typed client with session handling and single-flight token refresh.       |
| `apps/server`         | Hono + oRPC + Drizzle + PostgreSQL. Migrations in `apps/server/drizzle`.  |
| `apps/web`            | Vite + React 19 + TanStack Router/Query + Tailwind v4.                    |
| `apps/desktop`        | Electron. The main process owns the session; the renderer has no network. |
| `apps/mobile`         | Expo Router + NativeWind. Refresh token in the OS keychain (SecureStore). |
| `docs/specs`          | Feature specs with scenario IDs. The source of truth for behaviour.       |
| `tooling/`            | ESLint boundary rule, commit guard, spec check, git hooks.                |

## Rules

- **Spec, then test, then code.** New behaviour starts as a spec (`spec` skill) that the user approves. Implementation is test-first (`implement` skill). Test titles start with the scenario ID: `it("COM-3 ...")`.
- **Vertical slices.** A feature goes contract → server → clients in one pass. Do not split one feature's layers across agents.
- **Boundaries.** Apps never import each other. Shared code lives in `packages/`. ESLint enforces this.
- **Validate at the edges.** Zod schemas in the contract validate every request. Clients reuse the same schemas for forms.
- **Migrations are append-only.** Change `apps/server/src/db/schema.ts`, then `pnpm --filter @starter/server db:generate`.
- **No secrets in git.** Only `.env.example` files with variable names. The commit guard blocks key-like strings and `.env` files.
- **No type escape hatches.** No `any`, `as unknown as`, `@ts-ignore`; `eslint-disable` needs a reason after `--`.
- Commit subjects follow `type(scope): summary` (feat, fix, refactor, test, docs, build, ci, chore, perf).

## Guards

| Guard                      | When                | What it blocks                                                                |
| -------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| `.claude/hooks/edit-guard` | Before Claude edits | Logic edits with no test change in the same workspace, secrets, migrations    |
| `tooling/git-hooks`        | `git commit`        | Commit guard, spec check, Prettier and ESLint on staged files, message format |
| `pnpm spec:check`          | Pre-commit and CI   | Done scenarios without tests, tests naming unknown scenarios                  |
| CI                         | Every push and PR   | Lint, specs, tooling tests, typecheck, tests on real Postgres, builds         |

## Commands

```bash
pnpm db:up                                   # Postgres in Docker (also creates starter_test)
pnpm --filter @starter/server db:migrate     # apply migrations to DATABASE_URL
pnpm dev                                     # server :3000 + web :5173

pnpm --filter <package> test                 # while iterating
pnpm lint && pnpm spec:check && pnpm test:tooling && pnpm typecheck && pnpm test   # before finishing
```

Server integration tests need `TEST_DATABASE_URL` (default `postgres://starter:starter@localhost:5432/starter_test`). They refuse to run against a database whose name lacks `test`.

Report results as they are. If something could not be verified (for example the mobile app on a device, or the Electron window), say so.
