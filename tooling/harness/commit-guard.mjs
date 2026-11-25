#!/usr/bin/env node
// git 훅이 실행하는 검사:
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
    message: "타입 탈출구(`as any` / `as unknown as`)다. 타입을 고친다",
  },
  {
    applies: (file) => TYPESCRIPT.test(file),
    pattern: /@ts-(ignore|nocheck)/,
    message: "@ts-ignore / @ts-nocheck는 타입 오류를 숨긴다",
  },
  {
    applies: (file) => TEST_FILE.test(file),
    pattern: /\b(it|test|describe)\.only\(/,
    message: "`.only`는 나머지 테스트를 건너뛰게 한다",
  },
  {
    applies: (file) => /\.(ts|tsx|js|mjs|cjs)$/.test(file),
    pattern: /eslint-disable(?!.*--\s*\S)/,
    message: "eslint-disable에는 `--` 뒤에 이유가 필요하다",
  },
  {
    applies: () => true,
    pattern:
      /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{32,}/,
    message: "비밀값처럼 보인다. 비밀값은 .env(git 제외)에 두고 .env.example에는 이름만 적는다",
  },
];

/** 커밋이 한 파일에 더하는 줄의 문제. */
export function checkAddedLines(file, lines) {
  // 가드 자신의 테스트는 일부러 이 패턴을 담는다.
  if (file.startsWith("tooling/harness/")) return [];
  const problems = [];
  for (const rule of LINE_RULES) {
    if (!rule.applies(file)) continue;
    if (lines.some((line) => rule.pattern.test(line))) problems.push(`${file}: ${rule.message}`);
  }
  return problems;
}

/** 내용과 상관없이 어떤 파일을 스테이징했는지의 문제. */
export function checkStagedFiles(entries) {
  const problems = [];
  for (const { status, file } of entries) {
    const name = file.split("/").at(-1) ?? "";
    if ((name.startsWith(".env") && name !== ".env.example") || /\.(pem|key|p12)$/.test(name)) {
      problems.push(`${file}: 비밀값 파일은 커밋하지 않는다`);
    }
    if (status === "M" && /^apps\/server\/drizzle\/.+\.sql$/.test(file)) {
      problems.push(`${file}: 마이그레이션은 추가만 한다. 새 마이그레이션을 만든다`);
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
    : `커밋 제목은 "type(scope): 한글 요약" 형식이어야 한다(100자 이내). 받은 제목: "${subject}"`;
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
    console.error("commit-guard가 이 커밋을 막았다:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
