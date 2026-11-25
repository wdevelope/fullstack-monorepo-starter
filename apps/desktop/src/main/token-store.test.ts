import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSafeStorageTokenStore, type SafeStorageLike } from "./token-store.ts";

const API_URL = "http://localhost:3000/rpc";

/** OS 키체인 기반 암호화를 대신하는, 되돌릴 수 있는 가짜. */
function fakeSafeStorage(available = true): SafeStorageLike {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(`sealed:${Buffer.from(plain).toString("base64")}`),
    decryptString(encrypted) {
      const text = encrypted.toString();
      if (!text.startsWith("sealed:")) throw new Error("Error while decrypting the ciphertext");
      return Buffer.from(text.slice("sealed:".length), "base64").toString();
    },
  };
}

async function exists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

describe("safeStorage 리프레시 토큰 저장소", () => {
  let dir: string;
  let filePath: string;
  const create = (safeStorage = fakeSafeStorage(), apiUrl = API_URL) =>
    createSafeStorageTokenStore({ safeStorage, filePath, apiUrl });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "desktop-token-store-"));
    filePath = join(dir, "session.bin");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("DESK-11 토큰을 암호화해 쓰고 다시 시작한 뒤에도 읽는다", async () => {
    await create().set("refresh-secret-1");

    const onDisk = await readFile(filePath);
    expect(onDisk.toString()).not.toContain("refresh-secret-1");
    expect(await create().get()).toBe("refresh-secret-1");
  });

  it("DESK-11 파일은 사용자만 읽을 수 있다", async () => {
    if (process.platform === "win32") return;
    await create().set("refresh-secret-1");

    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it("DESK-11 회전하면 토큰을 바꾸고 로그아웃하면 파일을 지운다", async () => {
    const store = create();
    await store.set("refresh-1");
    await store.set("refresh-2");
    expect(await create().get()).toBe("refresh-2");

    await store.set(null);

    expect(await store.get()).toBeNull();
    expect(await exists(filePath)).toBe(false);
  });

  it("DESK-11 저장된 것이 없으면 null을 돌려준다", async () => {
    expect(await create().get()).toBeNull();
  });

  it("DESK-12 암호화를 쓸 수 없으면 토큰을 메모리에만 둔다", async () => {
    const store = create(fakeSafeStorage(false));

    await store.set("refresh-secret-1");

    expect(await store.get()).toBe("refresh-secret-1");
    expect(await exists(filePath)).toBe(false);
    expect(await create(fakeSafeStorage(false)).get()).toBeNull();
  });

  it("DESK-12 더는 암호화할 수 없으면 전에 저장한 토큰을 지운다", async () => {
    await create().set("refresh-old");

    await create(fakeSafeStorage(false)).set("refresh-new");

    expect(await exists(filePath)).toBe(false);
  });

  it("DESK-12 복호화할 수 없는 파일은 버린다", async () => {
    await writeFile(filePath, "garbage");

    expect(await create().get()).toBeNull();
    expect(await exists(filePath)).toBe(false);
  });

  it("DESK-13 한 서버용으로 저장한 토큰을 다른 서버에 넘기지 않는다", async () => {
    await create(fakeSafeStorage(), "http://localhost:3000/rpc").set("refresh-for-local");

    expect(await create(fakeSafeStorage(), "https://evil.example/rpc").get()).toBeNull();
    expect(await create(fakeSafeStorage(), "http://localhost:3000/rpc").get()).toBe(
      "refresh-for-local",
    );
  });
});
