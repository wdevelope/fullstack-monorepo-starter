import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { check, findTestIds, parseSpec } from "./spec-check.mjs";

const spec = (status, ids) =>
  parseSpec(
    "auth.md",
    [
      `- **Status**: ${status}`,
      "| ID | Given | Then |",
      "| --- | --- | --- |",
      ...ids.map((id) => `| ${id} | something | result |`),
    ].join("\n"),
  );

describe("spec-check", () => {
  it("reads status and scenario IDs from a spec", () => {
    assert.deepEqual(spec("Done", ["AUTH-1", "AUTH-2"]), {
      name: "auth.md",
      status: "Done",
      ids: ["AUTH-1", "AUTH-2"],
    });
  });

  it("finds IDs at the start of test titles only", () => {
    const source = `it("AUTH-1 signs up", ...); it.each([])('AUTH-3 rejects %s'); // see AUTH-9`;
    assert.deepEqual(findTestIds(source), ["AUTH-1", "AUTH-3"]);
  });

  it("passes when every Done scenario has a test", () => {
    assert.deepEqual(
      check([spec("Done", ["AUTH-1"])], [{ file: "a.test.ts", ids: ["AUTH-1"] }]),
      [],
    );
  });

  it("reports a Done scenario without a test", () => {
    assert.deepEqual(
      check([spec("Done", ["AUTH-1", "AUTH-2"])], [{ file: "a.test.ts", ids: ["AUTH-1"] }]),
      ["auth.md is Done but AUTH-2 has no test"],
    );
  });

  it("does not require tests for a Draft spec", () => {
    assert.deepEqual(check([spec("Draft", ["AUTH-1"])], []), []);
  });

  it("reports a test that points at an unknown scenario", () => {
    assert.deepEqual(check([spec("Draft", ["AUTH-1"])], [{ file: "a.test.ts", ids: ["AUTH-7"] }]), [
      "a.test.ts tests AUTH-7, which no spec defines",
    ]);
  });

  it("ignores ID-like strings with a prefix no spec uses", () => {
    assert.deepEqual(
      check([spec("Done", ["AUTH-1"])], [{ file: "a.test.ts", ids: ["AUTH-1", "UTF-8"] }]),
      [],
    );
  });
});
