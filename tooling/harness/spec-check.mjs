#!/usr/bin/env node
// docs/specs 명세와 코드·테스트가 어긋나지 않게 지킨다. `pnpm spec:check`로 실행한다.
//
// 검사하는 것
// 1. 머리말 형식: 상태(초안·승인·완료), ID 접두, 코드 경로가 있어야 한다.
// 2. 시나리오 ID: 명세의 ID 접두로 시작하고, 저장소 전체에서 한 번만 정의된다.
// 3. 시나리오 ↔ 테스트: 완료 명세의 시나리오에는 모두 테스트가 있고, 테스트가 부르는 ID는 어딘가에 정의돼 있다.
// 4. 코드 경로: 완료 명세의 경로는 실제로 있고, 모든 소스 파일은 승인·완료 명세 하나 이상이 덮는다.
//    그래서 명세 없이 새 소스 파일을 만들 수 없다("명세 먼저").
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STATUSES = ["초안", "승인", "완료"];
/** 코드를 덮을 수 있는 상태. 초안 명세만 덮는 코드는 아직 만들 수 없다. */
const COVERING_STATUSES = new Set(["승인", "완료"]);

const SCENARIO_ROW = /^\|\s*([A-Z]+-\d+)\s*\|/gm;
const FIELD = (name) => new RegExp(`^- \\*\\*${name}:\\*\\*[ \\t]*(.*)$`, "m");
// 테스트 제목은 시나리오 ID와 공백으로 시작한다: it("AUTH-3 이메일 형식이 틀리면 ...").
const TEST_TITLE_ID = /["'`]([A-Z]+-\d+) /g;

/** 명세가 덮는지 검사하는 소스: apps·packages의 src 아래와 Expo Router 라우트(apps/mobile/app). */
const SOURCE_ROOTS = [/^(apps|packages)\/[^/]+\/src\//, /^apps\/mobile\/app\//];

export function isSourceFile(file) {
  return (
    SOURCE_ROOTS.some((root) => root.test(file)) &&
    /\.(ts|tsx|mts)$/.test(file) &&
    !/\.(test|d)\.(ts|tsx|mts)$/.test(file)
  );
}

/** 명세 하나를 읽는다. 형식 문제는 problems에 담고, 검사는 계속할 수 있게 값을 채워 돌려준다. */
export function parseSpec(name, text) {
  const problems = [];
  const field = (label) => text.match(FIELD(label))?.[1]?.trim() ?? null;

  const status = field("상태");
  if (status === null) problems.push(`${name}: 머리말에 "- **상태:** 초안|승인|완료" 줄이 없다`);
  else if (!STATUSES.includes(status))
    problems.push(`${name}: 상태 값 "${status}" — ${STATUSES.join("·")} 중 하나여야 한다`);

  const prefix = field("ID 접두");
  if (prefix === null || !/^[A-Z]+$/.test(prefix))
    problems.push(`${name}: "- **ID 접두:** <영문 대문자>" 줄이 없거나 형식이 틀렸다`);

  const pathsLine = field("코드 경로");
  const paths = pathsLine ? [...pathsLine.matchAll(/`([^`]+)`/g)].map((match) => match[1]) : [];
  if (paths.length === 0)
    problems.push(`${name}: "- **코드 경로:**"에 백틱으로 감싼 경로가 하나 이상 있어야 한다`);

  const ids = [...text.matchAll(SCENARIO_ROW)].map((match) => match[1]);
  if (prefix) {
    for (const id of ids) {
      if (!id.startsWith(`${prefix}-`))
        problems.push(`${name}: 시나리오 ${id}의 접두가 ID 접두(${prefix})와 다르다`);
    }
  }

  return { name, status: status ?? "초안", prefix, paths, ids, problems };
}

export function findTestIds(text) {
  return [...text.matchAll(TEST_TITLE_ID)].map((match) => match[1]);
}

/** 디렉터리 경로(/로 끝남)는 그 아래 전부, 파일 경로는 그 파일만 덮는다. */
export function covers(specPath, file) {
  return specPath.endsWith("/") ? file.startsWith(specPath) : file === specPath;
}

/** file을 덮는 승인·완료 명세가 있는지. edit-guard도 이 함수를 쓴다. */
export function isCovered(file, specs) {
  return specs.some(
    (spec) => COVERING_STATUSES.has(spec.status) && spec.paths.some((p) => covers(p, file)),
  );
}

/**
 * 문제 목록을 돌려준다. 비어 있으면 명세·코드·테스트가 맞는다.
 * @param {ReturnType<typeof parseSpec>[]} specs
 * @param {{ file: string, ids: string[] }[]} tests
 * @param {{ sourceFiles?: string[], exists?: (p: string) => boolean }} [repo]
 */
export function check(specs, tests, { sourceFiles = [], exists = () => true } = {}) {
  const problems = specs.flatMap((spec) => spec.problems);

  const prefixOwner = new Map();
  for (const spec of specs) {
    if (!spec.prefix) continue;
    if (prefixOwner.has(spec.prefix))
      problems.push(`ID 접두 ${spec.prefix} 중복: ${prefixOwner.get(spec.prefix)}, ${spec.name}`);
    prefixOwner.set(spec.prefix, spec.name);
  }

  const owner = new Map();
  for (const spec of specs) {
    for (const id of spec.ids) {
      if (owner.has(id)) problems.push(`시나리오 ${id} 중복 정의: ${owner.get(id)}, ${spec.name}`);
      owner.set(id, spec.name);
    }
  }

  const prefixes = new Set([...owner.keys()].map((id) => id.split("-")[0]));
  const tested = new Set();
  for (const { file, ids } of tests) {
    for (const id of ids) {
      if (!prefixes.has(id.split("-")[0])) continue;
      if (!owner.has(id))
        problems.push(`${file}: 테스트 제목의 ${id} 시나리오가 어느 명세에도 없다`);
      tested.add(id);
    }
  }

  for (const spec of specs) {
    if (spec.status !== "완료") continue;
    for (const id of spec.ids) {
      if (!tested.has(id))
        problems.push(`${spec.name}: 완료 명세인데 시나리오 ${id}에 테스트가 없다`);
    }
    for (const specPath of spec.paths) {
      if (!exists(specPath))
        problems.push(`${spec.name}: 코드 경로에 적힌 ${specPath} 파일이나 폴더가 없다`);
    }
  }

  for (const file of sourceFiles) {
    if (!isCovered(file, specs))
      problems.push(
        `${file}: 이 파일을 덮는 승인·완료 명세가 없다. 알맞은 명세의 코드 경로에 더하거나 새 명세를 쓴다(spec 스킬)`,
      );
  }
  return problems;
}

function walk(root, dir, found = []) {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(root, relative, found);
    else found.push(relative);
  }
  return found;
}

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** docs/specs의 명세를 모두 읽는다. `_`로 시작하는 파일(템플릿)은 뺀다. */
export function loadSpecs(root = ROOT) {
  const specDir = path.join(root, "docs/specs");
  return readdirSync(specDir)
    .filter((name) => name.endsWith(".md") && !name.startsWith("_"))
    .map((name) => parseSpec(name, readFileSync(path.join(specDir, name), "utf8")));
}

function main() {
  const specs = loadSpecs();
  const files = ["apps", "packages"].flatMap((dir) => walk(ROOT, dir));
  const tests = files
    .filter((file) => /\.test\.tsx?$/.test(file))
    .map((file) => ({ file, ids: findTestIds(readFileSync(path.join(ROOT, file), "utf8")) }));

  const problems = check(specs, tests, {
    sourceFiles: files.filter(isSourceFile),
    exists: (p) => existsSync(path.join(ROOT, p)),
  });
  if (problems.length > 0) {
    console.error(`spec-check: 문제 ${problems.length}건`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  const total = specs.reduce((sum, spec) => sum + spec.ids.length, 0);
  console.log(
    `spec-check: 명세 ${specs.length}개, 시나리오 ${total}개, 모두 테스트와 코드 경로가 맞다.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
