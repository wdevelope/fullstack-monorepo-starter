#!/usr/bin/env node
// Claude Code PreToolUse 훅(Edit/Write/MultiEdit). 종료 코드 2는 편집을 막고 메시지를 에이전트에게 보여 준다.
// 리뷰어가 지적할 규칙을 편집하기 전에 적용한다.
//
// 막는 것
// 1. 비밀값 파일 쓰기(.env, 키 파일). 변수 이름은 .env.example에만 적는다.
// 2. 커밋된 마이그레이션 수정. 마이그레이션은 추가만 한다.
// 3. 명세 없는 소스: 승인·완료 명세의 코드 경로가 덮지 않는 소스 파일(명세 먼저).
// 4. 테스트 없는 로직 변경: 같은 워크스페이스의 테스트가 바뀌기 전에 로직 파일을 고치는 것(테스트 먼저).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isCovered, isSourceFile, loadSpecs } from "../../tooling/harness/spec-check.mjs";

const EXEMPT_FILE = ".claude/guard-exempt.local";
const EXEMPT_MINUTES = 60;

/** 저장소 기준 경로의 워크스페이스 루트. 예: "apps/server/src/a.ts" → "apps/server". */
function workspaceOf(relative) {
  const [kind, name] = relative.split("/");
  return (kind === "apps" || kind === "packages") && name ? `${kind}/${name}` : null;
}

/** 테스트가 먼저 바뀌어야 하는 로직 파일: src 아래 .ts 중 테스트·선언·진입점이 아닌 것. */
function needsTestFirst(relative) {
  return (
    /^(apps|packages)\/[^/]+\/src\/.+\.ts$/.test(relative) &&
    !/\.(test|d)\.ts$/.test(relative) &&
    !/\/src\/(main|index)\.ts$/.test(relative)
  );
}

/**
 * 편집을 허용할지 정한다.
 * @param {{ file: string, changedFiles: string[], trackedFiles: Set<string>, exempt: boolean, specs?: ReturnType<typeof loadSpecs> }} input
 *   `file`과 `changedFiles`는 저장소 기준 경로이고, `changedFiles`는 커밋하지 않은 변경이다.
 *   `specs`를 주지 않으면 명세 검사(3번)를 건너뛴다.
 * @returns {string | null} 막는 이유, 허용하면 null
 */
export function decide({ file, changedFiles, trackedFiles, exempt, specs }) {
  const name = file.split("/").at(-1) ?? "";
  if ((name.startsWith(".env") && name !== ".env.example") || /\.(pem|key|p12)$/.test(name)) {
    return `${file}: 비밀값 파일이다. 비밀값은 쓰지 않고 변수 이름만 .env.example에 적는다.`;
  }
  if (/^apps\/server\/drizzle\//.test(file) && trackedFiles.has(file)) {
    return `${file}: 커밋된 마이그레이션이다. 마이그레이션은 추가만 한다. src/db/schema.ts를 고치고 \`pnpm --filter @starter/server db:generate\`로 새 마이그레이션을 만든다.`;
  }
  if (specs && isSourceFile(file) && !isCovered(file, specs)) {
    return [
      `명세 먼저: ${file}를 덮는 승인·완료 명세가 docs/specs에 없다.`,
      "기존 기능의 파일이면 그 명세의 코드 경로에 더한다(시나리오가 그대로면 승인 없이 고치고 보고한다).",
      "새 기능이면 spec 스킬로 명세 초안을 쓰고 사용자 승인을 받은 뒤 만든다.",
    ].join("\n");
  }
  if (needsTestFirst(file) && !exempt) {
    const workspace = workspaceOf(file);
    const testTouched = changedFiles.some(
      (changed) => workspaceOf(changed) === workspace && /\.test\.tsx?$/.test(changed),
    );
    if (!testTouched) {
      return [
        `테스트 먼저: ${file}보다 ${workspace}의 테스트를 먼저 고친다.`,
        '명세 시나리오 ID로 시작하는 실패하는 테스트(예: it("COM-3 ..."))를 쓰고, 기대한 이유로 실패하는지 본 뒤 구현한다.',
        `동작이 바뀌지 않는 편집(이름 변경·이동·주석)이면 그 이유를 ${EXEMPT_FILE}에 적는다. ${EXEMPT_MINUTES}분 동안 유효하다.`,
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

  const reason = decide({ file, changedFiles, trackedFiles, exempt, specs: loadSpecs(root) });
  if (reason) {
    console.error(reason);
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
