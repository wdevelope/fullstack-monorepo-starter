import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkAddedLines, checkCommitMessage, checkStagedFiles } from "./commit-guard.mjs";

describe("commit-guard: added lines", () => {
  it("blocks type escape hatches in TypeScript", () => {
    assert.equal(checkAddedLines("apps/web/src/a.ts", ["const x = y as any;"]).length, 1);
    assert.equal(checkAddedLines("apps/web/src/a.tsx", ["const x = y as unknown as T;"]).length, 1);
    assert.equal(checkAddedLines("apps/web/src/a.ts", ["// @ts-ignore"]).length, 1);
  });

  it("allows the same words in prose", () => {
    assert.deepEqual(checkAddedLines("README.md", ["Avoid `as any` casts."]), []);
  });

  it("blocks .only in tests", () => {
    assert.equal(
      checkAddedLines("apps/server/src/a.test.ts", ['it.only("x", () => {})']).length,
      1,
    );
  });

  it("requires a reason on eslint-disable", () => {
    assert.equal(
      checkAddedLines("apps/web/src/a.ts", ["// eslint-disable-next-line no-console"]).length,
      1,
    );
    assert.deepEqual(
      checkAddedLines("apps/web/src/a.ts", [
        "// eslint-disable-next-line no-console -- CLI output",
      ]),
      [],
    );
  });

  it("blocks things that look like secrets in any file", () => {
    assert.equal(checkAddedLines("notes.txt", ["-----BEGIN PRIVATE KEY-----"]).length, 1);
    assert.equal(checkAddedLines("config.json", ['"key": "AKIAABCDEFGHIJKLMNOP"']).length, 1);
  });
});

describe("commit-guard: staged files", () => {
  it("blocks secret files but allows .env.example", () => {
    assert.equal(checkStagedFiles([{ status: "A", file: "apps/server/.env" }]).length, 1);
    assert.equal(checkStagedFiles([{ status: "A", file: "certs/server.pem" }]).length, 1);
    assert.deepEqual(checkStagedFiles([{ status: "A", file: "apps/server/.env.example" }]), []);
  });

  it("keeps migrations append-only", () => {
    assert.equal(
      checkStagedFiles([{ status: "M", file: "apps/server/drizzle/0000_init.sql" }]).length,
      1,
    );
    assert.deepEqual(
      checkStagedFiles([{ status: "A", file: "apps/server/drizzle/0001_next.sql" }]),
      [],
    );
  });
});

describe("commit-guard: commit message", () => {
  it("accepts conventional subjects", () => {
    assert.equal(checkCommitMessage("feat(server): add likes\n\nbody"), null);
    assert.equal(checkCommitMessage("fix: handle empty cursor"), null);
    assert.equal(checkCommitMessage("Merge branch 'main'"), null);
  });

  it("rejects free-form subjects", () => {
    assert.match(checkCommitMessage("updated stuff") ?? "", /commit subject/);
    assert.match(checkCommitMessage("feat:missing space") ?? "", /commit subject/);
  });
});
