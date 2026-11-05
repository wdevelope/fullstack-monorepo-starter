#!/usr/bin/env node
// Claude Code PreToolUse hook for Edit/Write/MultiEdit. Exit code 2 blocks the edit and shows
// the message to the agent. The same rules a reviewer would enforce, applied before the edit.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXEMPT_FILE = ".claude/guard-exempt.local";
const EXEMPT_MINUTES = 60;

/** Workspace root of a repo-relative path, e.g. "apps/server" for "apps/server/src/a.ts". */
function workspaceOf(relative) {
  const [kind, name] = relative.split("/");
  return (kind === "apps" || kind === "packages") && name ? `${kind}/${name}` : null;
}

/** Logic files that need a test change first: .ts under src, not tests, types or entry points. */
function needsTestFirst(relative) {
  return (
    /^(apps|packages)\/[^/]+\/src\/.+\.ts$/.test(relative) &&
    !/\.(test|d)\.ts$/.test(relative) &&
    !/\/src\/(main|index)\.ts$/.test(relative)
  );
}

/**
 * Decides whether an edit may go ahead.
 * @param {{ file: string, changedFiles: string[], trackedFiles: Set<string>, exempt: boolean }} input
 *   `file` and `changedFiles` are repo-relative; `changedFiles` are uncommitted changes.
 * @returns {string | null} a reason to block, or null to allow
 */
export function decide({ file, changedFiles, trackedFiles, exempt }) {
  const name = file.split("/").at(-1) ?? "";
  if ((name.startsWith(".env") && name !== ".env.example") || /\.(pem|key|p12)$/.test(name)) {
    return `${file} holds secrets. Do not write secrets; list variable names in .env.example.`;
  }
  if (/^apps\/server\/drizzle\//.test(file) && trackedFiles.has(file)) {
    return `${file} is a committed migration and migrations are append-only. Change src/db/schema.ts and run \`pnpm --filter @starter/server db:generate\`.`;
  }
  if (needsTestFirst(file) && !exempt) {
    const workspace = workspaceOf(file);
    const testTouched = changedFiles.some(
      (changed) => workspaceOf(changed) === workspace && /\.test\.tsx?$/.test(changed),
    );
    if (!testTouched) {
      return [
        `Test first: change a test in ${workspace} before ${file}.`,
        'Write a failing test titled with the spec scenario ID (e.g. it("COM-3 ...")), see it fail, then implement.',
        `If this edit cannot change behaviour (rename, move, comment), write the reason in ${EXEMPT_FILE}; it is honoured for ${EXEMPT_MINUTES} minutes.`,
      ].join("\n");
    }
  }
  return null;
}

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

function main() {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const target = input.tool_input?.file_path;
  if (typeof target !== "string") return;

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const file = path
    .relative(root, path.resolve(input.cwd ?? root, target))
    .split(path.sep)
    .join("/");
  if (file.startsWith("..")) return;

  const changedFiles = git(root, "status", "--porcelain", "--untracked-files=all")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).split(" -> ").at(-1) ?? "");
  const trackedFiles = new Set(git(root, "ls-files", "apps/server/drizzle").split("\n"));
  const exemptPath = path.join(root, EXEMPT_FILE);
  const exempt =
    existsSync(exemptPath) &&
    Date.now() - statSync(exemptPath).mtimeMs < EXEMPT_MINUTES * 60_000 &&
    readFileSync(exemptPath, "utf8").trim().length > 0;

  const reason = decide({ file, changedFiles, trackedFiles, exempt });
  if (reason) {
    console.error(reason);
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
