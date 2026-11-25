import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { check, covers, findTestIds, isSourceFile, parseSpec } from "./spec-check.mjs";

const spec = (status, ids, { prefix = "AUTH", paths = ["apps/server/src/features/auth/"] } = {}) =>
  parseSpec(
    `${prefix.toLowerCase()}.md`,
    [
      "# 명세: 인증",
      "",
      `- **상태:** ${status}`,
      `- **ID 접두:** ${prefix}`,
      `- **코드 경로:** ${paths.map((p) => `\`${p}\``).join(", ")}`,
      "",
      "| ID | 전제 / 행동 | 결과 |",
      "| --- | --- | --- |",
      ...ids.map((id) => `| ${id} | 무엇을 하면 | 이렇게 된다 |`),
    ].join("\n"),
  );

describe("spec-check", () => {
  it("명세에서 상태·ID 접두·코드 경로·시나리오 ID를 읽는다", () => {
    const parsed = spec("완료", ["AUTH-1", "AUTH-2"], {
      paths: ["packages/contracts/src/auth.ts", "apps/server/src/features/auth/"],
    });
    assert.deepEqual(parsed, {
      name: "auth.md",
      status: "완료",
      prefix: "AUTH",
      paths: ["packages/contracts/src/auth.ts", "apps/server/src/features/auth/"],
      ids: ["AUTH-1", "AUTH-2"],
      problems: [],
    });
  });

  it("머리말이 빠졌거나 상태 값이 틀리면 형식 문제로 보고한다", () => {
    assert.deepEqual(parseSpec("x.md", "# 명세").problems.length, 3);
    assert.match(spec("Done", []).problems[0] ?? "", /초안·승인·완료/);
  });

  it("시나리오 ID가 명세의 ID 접두로 시작하지 않으면 보고한다", () => {
    assert.match(spec("초안", ["COM-1"]).problems[0] ?? "", /ID 접두\(AUTH\)와 다르다/);
  });

  it("테스트 제목 맨 앞의 ID만 찾는다", () => {
    const source = `it("AUTH-1 가입한다", ...); it.each([])('AUTH-3 %s를 거부한다'); // AUTH-9 참고`;
    assert.deepEqual(findTestIds(source), ["AUTH-1", "AUTH-3"]);
  });

  it("완료 명세의 시나리오에 모두 테스트가 있으면 통과한다", () => {
    assert.deepEqual(
      check([spec("완료", ["AUTH-1"])], [{ file: "a.test.ts", ids: ["AUTH-1"] }]),
      [],
    );
  });

  it("완료 명세에 테스트 없는 시나리오가 있으면 보고한다", () => {
    assert.deepEqual(
      check([spec("완료", ["AUTH-1", "AUTH-2"])], [{ file: "a.test.ts", ids: ["AUTH-1"] }]),
      ["auth.md: 완료 명세인데 시나리오 AUTH-2에 테스트가 없다"],
    );
  });

  it("초안·승인 명세는 테스트를 요구하지 않는다", () => {
    assert.deepEqual(check([spec("초안", ["AUTH-1"])], []), []);
    assert.deepEqual(check([spec("승인", ["AUTH-1"])], []), []);
  });

  it("어느 명세에도 없는 시나리오를 부르는 테스트를 보고한다", () => {
    assert.deepEqual(check([spec("초안", ["AUTH-1"])], [{ file: "a.test.ts", ids: ["AUTH-7"] }]), [
      "a.test.ts: 테스트 제목의 AUTH-7 시나리오가 어느 명세에도 없다",
    ]);
  });

  it("어느 명세도 쓰지 않는 접두의 ID 모양 문자열은 무시한다", () => {
    assert.deepEqual(
      check([spec("완료", ["AUTH-1"])], [{ file: "a.test.ts", ids: ["AUTH-1", "UTF-8"] }]),
      [],
    );
  });

  it("ID 접두나 시나리오 ID가 두 명세에서 겹치면 보고한다", () => {
    const problems = check([spec("초안", ["AUTH-1"]), spec("초안", ["AUTH-1"])], []);
    assert.deepEqual(problems, [
      "ID 접두 AUTH 중복: auth.md, auth.md",
      "시나리오 AUTH-1 중복 정의: auth.md, auth.md",
    ]);
  });

  it("디렉터리 경로는 그 아래 전부를, 파일 경로는 그 파일만 덮는다", () => {
    assert.equal(covers("apps/web/src/lib/", "apps/web/src/lib/errors.ts"), true);
    assert.equal(covers("apps/web/src/lib/errors.ts", "apps/web/src/lib/errors.ts"), true);
    assert.equal(covers("apps/web/src/lib/errors.ts", "apps/web/src/lib/errors.tsx"), false);
    assert.equal(covers("apps/web/src/li", "apps/web/src/lib/errors.ts"), false);
  });

  it("명세가 덮어야 하는 소스는 src와 Expo 라우트의 ts·tsx이고 테스트·선언 파일은 뺀다", () => {
    assert.equal(isSourceFile("apps/server/src/main.ts"), true);
    assert.equal(isSourceFile("apps/mobile/app/sign-in.tsx"), true);
    assert.equal(isSourceFile("packages/contracts/src/auth.test.ts"), false);
    assert.equal(isSourceFile("apps/desktop/src/renderer/env.d.ts"), false);
    assert.equal(isSourceFile("apps/server/test/test-app.ts"), false);
    assert.equal(isSourceFile("apps/web/src/index.css"), false);
  });

  it("승인·완료 명세가 덮지 않는 소스 파일을 보고한다", () => {
    const specs = [spec("완료", [], { paths: ["apps/server/src/features/auth/"] })];
    const sourceFiles = [
      "apps/server/src/features/auth/auth.service.ts",
      "apps/server/src/features/bookmarks/bookmarks.service.ts",
    ];
    assert.deepEqual(check(specs, [], { sourceFiles }), [
      "apps/server/src/features/bookmarks/bookmarks.service.ts: 이 파일을 덮는 승인·완료 명세가 없다. 알맞은 명세의 코드 경로에 더하거나 새 명세를 쓴다(spec 스킬)",
    ]);
  });

  it("초안 명세는 소스를 덮지 못한다", () => {
    const specs = [
      spec("초안", [], { prefix: "BM", paths: ["apps/server/src/features/bookmarks/"] }),
    ];
    const sourceFiles = ["apps/server/src/features/bookmarks/bookmarks.service.ts"];
    assert.equal(check(specs, [], { sourceFiles }).length, 1);
  });

  it("완료 명세의 코드 경로가 없으면 보고하고, 승인 명세는 아직 없는 경로를 적을 수 있다", () => {
    const exists = () => false;
    assert.deepEqual(check([spec("완료", [])], [], { exists }), [
      "auth.md: 코드 경로에 적힌 apps/server/src/features/auth/ 파일이나 폴더가 없다",
    ]);
    assert.deepEqual(check([spec("승인", [])], [], { exists }), []);
  });
});
