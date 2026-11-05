---
name: spec
description: Write or change a feature spec in docs/specs before any code. Use when starting a feature ("let's add bookmarks"), when a behaviour must change, or when the edit guard says no spec covers the change.
---

# Writing a spec

A spec is the source of truth for a feature's behaviour. Code and tests follow it, never the other way round.

1. Copy `docs/specs/_template.md` to `docs/specs/<feature>.md` (or open the existing spec).
2. Fill in Goal, Rules, Scenarios, Contract and Data. Keep it short and concrete.
   - Every scenario gets a new ID with the spec's prefix (`AUTH-18`, `COM-12`). Never reuse or renumber IDs.
   - A scenario is one observable behaviour: given/when, then. Include the error code for failure cases.
   - Rules are invariants (security, data integrity, idempotency) that hold in every scenario.
3. Set **Status** to `Draft` and show the spec to the user. Ask for approval; do not assume it.
4. When the user approves, set **Status** to `Approved`. Only then start the `implement` skill.
5. If implementation shows the spec is wrong or incomplete, stop, update the spec, and ask again.

`pnpm spec:check` fails if a `Done` spec has a scenario without a test, or a test names an unknown scenario.
