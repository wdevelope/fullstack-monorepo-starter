import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decide } from "./edit-guard.mjs";

const base = { changedFiles: [], trackedFiles: new Set(), exempt: false };

describe("edit-guard", () => {
  it("blocks writing secret files but allows .env.example", () => {
    assert.match(decide({ ...base, file: "apps/server/.env" }) ?? "", /secrets/);
    assert.equal(decide({ ...base, file: "apps/server/.env.example" }), null);
  });

  it("blocks editing a committed migration", () => {
    const trackedFiles = new Set(["apps/server/drizzle/0000_init.sql"]);
    assert.match(
      decide({ ...base, trackedFiles, file: "apps/server/drizzle/0000_init.sql" }) ?? "",
      /append-only/,
    );
  });

  it("requires a test change in the same workspace before logic changes", () => {
    const file = "apps/server/src/features/posts/posts.service.ts";
    assert.match(decide({ ...base, file }) ?? "", /Test first/);
    assert.match(
      decide({ ...base, file, changedFiles: ["apps/web/src/lib/errors.test.ts"] }) ?? "",
      /Test first/,
    );
    assert.equal(
      decide({ ...base, file, changedFiles: ["apps/server/src/features/posts/posts.test.ts"] }),
      null,
    );
  });

  it("does not require tests for screens, tests, entry points or docs", () => {
    for (const file of [
      "apps/web/src/routes/post.tsx",
      "apps/server/src/features/posts/posts.test.ts",
      "apps/server/src/main.ts",
      "packages/api-client/src/index.ts",
      "docs/specs/auth.md",
    ]) {
      assert.equal(decide({ ...base, file }), null, file);
    }
  });

  it("honours a recent exemption for behaviour-neutral edits", () => {
    assert.equal(
      decide({ ...base, exempt: true, file: "apps/server/src/features/posts/posts.service.ts" }),
      null,
    );
  });
});
