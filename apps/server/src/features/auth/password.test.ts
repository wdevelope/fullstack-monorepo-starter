import { describe, expect, it } from "vitest";

import { createPasswordHasher } from "./password.ts";

const hasher = createPasswordHasher(2 ** 10);

describe("password hasher", () => {
  it("AUTH-14 stores a salted scrypt hash that verifies only the original password", async () => {
    const first = await hasher.hash("correct horse");
    const second = await hasher.hash("correct horse");

    expect(first).toMatch(/^scrypt\$1024\$[\w-]+\$[\w-]+$/);
    expect(first).not.toContain("correct horse");
    expect(first).not.toBe(second);
    expect(await hasher.verify(first, "correct horse")).toBe(true);
    expect(await hasher.verify(first, "correct horsE")).toBe(false);
  });

  it("AUTH-14 verifies a hash made with a different cost using the cost stored in it", async () => {
    const stored = await createPasswordHasher(2 ** 11).hash("password1");
    expect(await hasher.verify(stored, "password1")).toBe(true);
  });
});
