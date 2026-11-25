import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSpec } from "../../tooling/harness/spec-check.mjs";
import { decide } from "./edit-guard.mjs";

const base = { changedFiles: [], trackedFiles: new Set(), exempt: false };

const postsSpec = (status) =>
  parseSpec(
    "community.md",
    [
      `- **상태:** ${status}`,
      "- **ID 접두:** COM",
      "- **코드 경로:** `apps/server/src/features/posts/`",
    ].join("\n"),
  );

describe("edit-guard", () => {
  it("비밀값 파일 쓰기는 막고 .env.example은 허용한다", () => {
    assert.match(decide({ ...base, file: "apps/server/.env" }) ?? "", /비밀값/);
    assert.equal(decide({ ...base, file: "apps/server/.env.example" }), null);
  });

  it("커밋된 마이그레이션 수정을 막는다", () => {
    const trackedFiles = new Set(["apps/server/drizzle/0000_init.sql"]);
    assert.match(
      decide({ ...base, trackedFiles, file: "apps/server/drizzle/0000_init.sql" }) ?? "",
      /추가만 한다/,
    );
  });

  it("로직을 고치기 전에 같은 워크스페이스의 테스트 변경을 요구한다", () => {
    const file = "apps/server/src/features/posts/posts.service.ts";
    assert.match(decide({ ...base, file }) ?? "", /테스트 먼저/);
    assert.match(
      decide({ ...base, file, changedFiles: ["apps/web/src/lib/errors.test.ts"] }) ?? "",
      /테스트 먼저/,
    );
    assert.equal(
      decide({ ...base, file, changedFiles: ["apps/server/src/features/posts/posts.test.ts"] }),
      null,
    );
  });

  it("화면·테스트·진입점·문서에는 테스트 변경을 요구하지 않는다", () => {
    for (const file of [
      "apps/web/src/routes/post.tsx",
      "apps/server/src/features/posts/posts.test.ts",
      "apps/server/src/main.ts",
      "packages/api-client/src/index.ts",
      "docs/specs/auth.md",
    ]) {
      assert.equal(decide({ ...base, file }), null, file);
    }
  });

  it("동작이 바뀌지 않는 편집의 최근 예외를 인정한다", () => {
    assert.equal(
      decide({ ...base, exempt: true, file: "apps/server/src/features/posts/posts.service.ts" }),
      null,
    );
  });

  it("승인·완료 명세가 덮지 않는 소스 파일은 명세 먼저 쓰라고 막는다", () => {
    const file = "apps/server/src/features/bookmarks/bookmarks.service.ts";
    const exempt = { ...base, exempt: true };
    assert.match(decide({ ...exempt, file, specs: [postsSpec("완료")] }) ?? "", /명세 먼저/);
    assert.equal(
      decide({
        ...exempt,
        file: "apps/server/src/features/posts/posts.service.ts",
        specs: [postsSpec("승인")],
      }),
      null,
    );
  });

  it("초안 명세는 소스를 덮지 못한다", () => {
    const file = "apps/server/src/features/posts/posts.router.ts";
    assert.match(
      decide({ ...base, exempt: true, file, specs: [postsSpec("초안")] }) ?? "",
      /명세 먼저/,
    );
  });
});
