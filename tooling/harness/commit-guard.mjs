#!/usr/bin/env node
// Checks run by the git hooks:
//   node tooling/harness/commit-guard.mjs --staged            (pre-commit)
//   node tooling/harness/commit-guard.mjs --commit-msg <file> (commit-msg)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TYPESCRIPT = /\.(ts|tsx|mts|cts)$/;
const TEST_FILE = /\.test\.(ts|tsx|mjs)$/;

const LINE_RULES = [
  {
    applies: (file) => TYPESCRIPT.test(file),
    pattern: /\bas any\b|\bas unknown as\b/,
    message: "type escape hatch (`as any` / `as unknown as`); fix the type instead",
  },
  {
    applies: (file) => TYPESCRIPT.test(file),
    pattern: /@ts-(ignore|nocheck)/,
    message: "@ts-ignore / @ts-nocheck hides type errors",
  },
  {
    applies: (file) => TEST_FILE.test(file),
    pattern: /\b(it|test|describe)\.only\(/,
    message: ".only would skip the rest of the suite",
  },
  {
    applies: (file) => /\.(ts|tsx|js|mjs|cjs)$/.test(file),
    pattern: /eslint-disable(?!.*--\s*\S)/,
    message: "eslint-disable needs a reason after `--`",
  },
  {
    applies: () => true,
    pattern:
      /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{32,}/,
    message:
      "looks like a secret; keep secrets in .env (ignored) and list only names in .env.example",
  },
];

/** Problems in the lines a commit adds to one file. */
export function checkAddedLines(file, lines) {
  // The guard's own tests contain the patterns on purpose.
  if (file.startsWith("tooling/harness/")) return [];
  const problems = [];
  for (const rule of LINE_RULES) {
    if (!rule.applies(file)) continue;
    if (lines.some((line) => rule.pattern.test(line))) problems.push(`${file}: ${rule.message}`);
  }
  return problems;
}

/** Problems with which files are staged, regardless of content. */
export function checkStagedFiles(entries) {
  const problems = [];
  for (const { status, file } of entries) {
    const name = file.split("/").at(-1) ?? "";
    if ((name.startsWith(".env") && name !== ".env.example") || /\.(pem|key|p12)$/.test(name)) {
      problems.push(`${file}: secret files must not be committed`);
    }
    if (status === "M" && /^apps\/server\/drizzle\/.+\.sql$/.test(file)) {
      problems.push(`${file}: migrations are append-only; add a new migration instead`);
    }
  }
  return problems;
}

const COMMIT_SUBJECT =
  /^(feat|fix|refactor|test|docs|build|ci|chore|perf|revert)(\([a-z0-9-]+\))?!?: \S.{0,99}$/;

export function checkCommitMessage(message) {
  const subject = message.split("\n")[0] ?? "";
  if (subject.startsWith("Merge ") || subject.startsWith('Revert "')) return null;
  return COMMIT_SUBJECT.test(subject)
    ? null
    : `commit subject must look like "feat(scope): what changed" (max 100 chars), got: "${subject}"`;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function stagedProblems() {
  const entries = git("diff", "--cached", "--name-status", "--diff-filter=AM")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status = "", file = ""] = line.split("\t");
      return { status, file };
    });

  const problems = checkStagedFiles(entries);
  for (const { file } of entries) {
    const added = git("diff", "--cached", "-U0", "--", file)
      .split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .map((line) => line.slice(1));
    problems.push(...checkAddedLines(file, added));
  }
  return problems;
}

function main() {
  const [mode, file] = process.argv.slice(2);
  const problems =
    mode === "--commit-msg"
      ? [checkCommitMessage(readFileSync(file, "utf8"))].filter(Boolean)
      : stagedProblems();

  if (problems.length > 0) {
    console.error("commit-guard blocked this commit:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
