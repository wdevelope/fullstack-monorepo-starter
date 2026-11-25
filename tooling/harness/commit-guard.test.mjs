import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkAddedLines, checkCommitMessage, checkStagedFiles } from "./commit-guard.mjs";

describe("commit-guard: 더한 줄", () => {
  it("TypeScript의 타입 탈출구를 막는다", () => {
    assert.equal(checkAddedLines("apps/web/src/a.ts", ["const x = y as any;"]).length, 1);
    assert.equal(checkAddedLines("apps/web/src/a.tsx", ["const x = y as unknown as T;"]).length, 1);
    assert.equal(checkAddedLines("apps/web/src/a.ts", ["// @ts-ignore"]).length, 1);
  });

  it("문서 속 같은 단어는 허용한다", () => {
    assert.deepEqual(checkAddedLines("README.md", ["`as any` 캐스팅은 피한다."]), []);
  });

  it("테스트의 .only를 막는다", () => {
    assert.equal(
      checkAddedLines("apps/server/src/a.test.ts", ['it.only("x", () => {})']).length,
      1,
    );
  });

  it("eslint-disable에 이유를 요구한다", () => {
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

  it("어느 파일이든 비밀값처럼 보이는 것을 막는다", () => {
    assert.equal(checkAddedLines("notes.txt", ["-----BEGIN PRIVATE KEY-----"]).length, 1);
    assert.equal(checkAddedLines("config.json", ['"key": "AKIAABCDEFGHIJKLMNOP"']).length, 1);
  });
});

describe("commit-guard: 스테이징한 파일", () => {
  it("비밀값 파일은 막고 .env.example은 허용한다", () => {
    assert.equal(checkStagedFiles([{ status: "A", file: "apps/server/.env" }]).length, 1);
    assert.equal(checkStagedFiles([{ status: "A", file: "certs/server.pem" }]).length, 1);
    assert.deepEqual(checkStagedFiles([{ status: "A", file: "apps/server/.env.example" }]), []);
  });

  it("마이그레이션은 추가만 하게 한다", () => {
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

describe("commit-guard: 커밋 메시지", () => {
  it("type(scope): 요약 형식의 제목을 받는다", () => {
    assert.equal(checkCommitMessage("feat(server): 좋아요 추가\n\n본문"), null);
    assert.equal(checkCommitMessage("fix: 빈 커서 처리"), null);
    assert.equal(checkCommitMessage("Merge branch 'main'"), null);
  });

  it("형식 없는 제목을 거부한다", () => {
    assert.match(checkCommitMessage("이것저것 고침") ?? "", /커밋 제목/);
    assert.match(checkCommitMessage("feat:띄어쓰기 없음") ?? "", /커밋 제목/);
  });
});
