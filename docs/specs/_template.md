# <Feature name>

- **Status**: Draft | Approved | Done
- **Code**: paths this spec owns (e.g. `apps/server/src/features/<feature>/`)

## Goal

What the feature is for and who uses it, in two or three sentences.

## Rules

Business rules and invariants the code must keep. Number them so tests and reviews can point at them.

## Scenarios

Every row needs at least one test whose title starts with the ID (`it("XYZ-1 ...")`). `pnpm spec:check` enforces this.

| ID    | Given / When | Then |
| ----- | ------------ | ---- |
| XYZ-1 |              |      |

## Contract

Procedures in `packages/contracts` and their typed errors.

## Data

Tables, constraints and indexes.
