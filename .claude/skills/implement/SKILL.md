---
name: implement
description: Implement an approved spec test-first, as one vertical slice from contract to server to clients. Use after the spec skill, or when asked to build a feature whose spec is Approved.
---

# Implementing a spec

Precondition: the spec in `docs/specs/` has **Status: Approved**. If it is Draft, use the `spec` skill first.

Work through the slice in this order, in one context (do not split layers between agents):

1. **Contract** (`packages/contracts`): add or change procedures, Zod schemas and typed errors. Add input-validation tests.
2. **Server** (`apps/server`): for each scenario, write the integration test first, titled with its ID (`it("COM-12 ...")`), run it and see it fail, then write the smallest code that passes. Schema changes go in `src/db/schema.ts`, then `pnpm --filter @starter/server db:generate`; never edit a committed migration.
3. **Clients** (`apps/web`, `apps/desktop`, `apps/mobile`): use the typed client from `@starter/api-client`; never call fetch directly. Reuse the contract's Zod schemas for form validation.
4. **Finish**: all scenarios pass, set the spec's Status to `Done`, run the checks below, and report what passed and anything you could not verify (for example, running the mobile app on a device).

The edit guard (`.claude/hooks/edit-guard.mjs`) blocks logic edits until a test in the same workspace has changed. For a pure rename or move, write the reason in `.claude/guard-exempt.local` (valid 60 minutes) and mention it in the report.

## Checks

```bash
pnpm --filter <package> test        # while iterating
pnpm --filter <package> typecheck
pnpm lint && pnpm spec:check && pnpm typecheck && pnpm test   # before you say it is done
```
