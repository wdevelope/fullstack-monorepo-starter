import { describe, expect, it } from "vitest";

import { createPasswordHasher } from "./password.ts";

const hasher = createPasswordHasher(2 ** 10);

describe("비밀번호 해셔", () => {
  it("AUTH-14 솔트를 친 scrypt 해시를 저장하고, 원래 비밀번호만 검증을 통과한다", async () => {
    const first = await hasher.hash("correct horse");
    const second = await hasher.hash("correct horse");

    expect(first).toMatch(/^scrypt\$1024\$[\w-]+\$[\w-]+$/);
    expect(first).not.toContain("correct horse");
    expect(first).not.toBe(second);
    expect(await hasher.verify(first, "correct horse")).toBe(true);
    expect(await hasher.verify(first, "correct horsE")).toBe(false);
  });

  it("AUTH-14 다른 비용으로 만든 해시는 그 안에 저장된 비용으로 검증한다", async () => {
    const stored = await createPasswordHasher(2 ** 11).hash("password1");
    expect(await hasher.verify(stored, "password1")).toBe(true);
  });
});
