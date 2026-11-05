#!/usr/bin/env node
// Keeps docs/specs and the tests in step: every scenario of a finished spec has a test, and every
// scenario ID a test mentions exists in a spec. Run with `pnpm spec:check`.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCENARIO_ROW = /^\|\s*([A-Z]+-\d+)\s*\|/gm;
const STATUS_LINE = /^- \*\*Status\*\*:\s*(\w+)/m;
// A test title starts with the scenario ID followed by a space: it("AUTH-3 rejects ...").
const TEST_TITLE_ID = /["'`]([A-Z]+-\d+) /g;

export function parseSpec(name, text) {
  const ids = [...text.matchAll(SCENARIO_ROW)].map((match) => match[1]);
  return { name, status: text.match(STATUS_LINE)?.[1] ?? "Draft", ids };
}

export function findTestIds(text) {
  return [...text.matchAll(TEST_TITLE_ID)].map((match) => match[1]);
}

/** Returns a list of problems; empty means the specs and tests agree. */
export function check(specs, tests) {
  const problems = [];
  const owner = new Map();
  for (const spec of specs) {
    for (const id of spec.ids) {
      if (owner.has(id))
        problems.push(`${id} is defined in both ${owner.get(id)} and ${spec.name}`);
      owner.set(id, spec.name);
    }
  }

  const prefixes = new Set([...owner.keys()].map((id) => id.split("-")[0]));
  const tested = new Set();
  for (const { file, ids } of tests) {
    for (const id of ids) {
      if (!prefixes.has(id.split("-")[0])) continue;
      if (!owner.has(id)) problems.push(`${file} tests ${id}, which no spec defines`);
      tested.add(id);
    }
  }

  for (const spec of specs) {
    if (spec.status !== "Done") continue;
    for (const id of spec.ids) {
      if (!tested.has(id)) problems.push(`${spec.name} is Done but ${id} has no test`);
    }
  }
  return problems;
}

function walk(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (/\.test\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const specDir = path.join(root, "docs/specs");
  const specs = readdirSync(specDir)
    .filter((name) => name.endsWith(".md") && !name.startsWith("_"))
    .map((name) => parseSpec(name, readFileSync(path.join(specDir, name), "utf8")));

  const tests = ["apps", "packages"]
    .flatMap((dir) => walk(path.join(root, dir)))
    .map((file) => ({
      file: path.relative(root, file),
      ids: findTestIds(readFileSync(file, "utf8")),
    }));

  const problems = check(specs, tests);
  if (problems.length > 0) {
    console.error(`spec-check found ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  const total = specs.reduce((sum, spec) => sum + spec.ids.length, 0);
  console.log(`spec-check: ${specs.length} specs, ${total} scenarios, all linked to tests.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
