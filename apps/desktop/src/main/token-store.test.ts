import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSafeStorageTokenStore, type SafeStorageLike } from "./token-store.ts";

const API_URL = "http://localhost:3000/rpc";

/** Reversible stand-in for the OS keychain-backed cipher. */
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

describe("safeStorage refresh token store", () => {
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

  it("writes the token encrypted and reads it back after a restart", async () => {
    await create().set("refresh-secret-1");

    const onDisk = await readFile(filePath);
    expect(onDisk.toString()).not.toContain("refresh-secret-1");
    expect(await create().get()).toBe("refresh-secret-1");
  });

  it("keeps the file private to the user", async () => {
    if (process.platform === "win32") return;
    await create().set("refresh-secret-1");

    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it("replaces the token on rotation and deletes the file on sign-out", async () => {
    const store = create();
    await store.set("refresh-1");
    await store.set("refresh-2");
    expect(await create().get()).toBe("refresh-2");

    await store.set(null);

    expect(await store.get()).toBeNull();
    expect(await exists(filePath)).toBe(false);
  });

  it("returns null when nothing was stored", async () => {
    expect(await create().get()).toBeNull();
  });

  it("keeps the token in memory only when encryption is unavailable", async () => {
    const store = create(fakeSafeStorage(false));

    await store.set("refresh-secret-1");

    expect(await store.get()).toBe("refresh-secret-1");
    expect(await exists(filePath)).toBe(false);
    expect(await create(fakeSafeStorage(false)).get()).toBeNull();
  });

  it("removes a token saved earlier once it can no longer be encrypted", async () => {
    await create().set("refresh-old");

    await create(fakeSafeStorage(false)).set("refresh-new");

    expect(await exists(filePath)).toBe(false);
  });

  it("discards a file it cannot decrypt", async () => {
    await writeFile(filePath, "garbage");

    expect(await create().get()).toBeNull();
    expect(await exists(filePath)).toBe(false);
  });

  it("does not hand a token saved for one server to another", async () => {
    await create(fakeSafeStorage(), "http://localhost:3000/rpc").set("refresh-for-local");

    expect(await create(fakeSafeStorage(), "https://evil.example/rpc").get()).toBeNull();
    expect(await create(fakeSafeStorage(), "http://localhost:3000/rpc").get()).toBe(
      "refresh-for-local",
    );
  });
});
