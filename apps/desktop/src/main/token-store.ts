import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { RefreshTokenStore } from "@starter/api-client";

/** The part of Electron's `safeStorage` this store needs. Tests pass a fake. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface SafeStorageTokenStoreOptions {
  safeStorage: SafeStorageLike;
  /** Encrypted file, normally under `app.getPath("userData")`. */
  filePath: string;
  /** The server the token belongs to. A token is only ever returned for the server that issued it. */
  apiUrl: string;
}

interface Saved {
  apiUrl: string;
  refreshToken: string;
}

function parseSaved(text: string): Saved | null {
  const value: unknown = JSON.parse(text);
  if (
    typeof value === "object" &&
    value !== null &&
    "apiUrl" in value &&
    typeof value.apiUrl === "string" &&
    "refreshToken" in value &&
    typeof value.refreshToken === "string"
  ) {
    return { apiUrl: value.apiUrl, refreshToken: value.refreshToken };
  }
  return null;
}

function isNotFound(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Keeps the refresh token encrypted with the OS keychain (via `safeStorage`). When encryption is
 * unavailable the token lives in memory only, so the user signs in again after a restart rather
 * than having a plaintext token on disk.
 */
export function createSafeStorageTokenStore(
  options: SafeStorageTokenStoreOptions,
): RefreshTokenStore {
  const { safeStorage, filePath, apiUrl } = options;
  // undefined means "not read from disk yet"; null means "no token".
  let current: string | null | undefined;

  async function load(): Promise<string | null> {
    if (!safeStorage.isEncryptionAvailable()) return null;
    let encrypted: Buffer;
    try {
      encrypted = await readFile(filePath);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    let saved: Saved | null = null;
    try {
      saved = parseSaved(safeStorage.decryptString(encrypted));
    } catch {
      // Handled below: corrupt or sealed with a key the OS no longer has.
    }
    if (!saved) {
      await rm(filePath, { force: true });
      return null;
    }
    return saved.apiUrl === apiUrl ? saved.refreshToken : null;
  }

  return {
    async get() {
      if (current === undefined) current = await load();
      return current;
    },

    async set(token) {
      current = token;
      if (token === null || !safeStorage.isEncryptionAvailable()) {
        // Never write plaintext. Removing the old file also keeps an already rotated token from
        // being replayed on the next launch, which the server would treat as theft.
        await rm(filePath, { force: true });
        return;
      }
      const saved: Saved = { apiUrl, refreshToken: token };
      await mkdir(dirname(filePath), { recursive: true });
      // Write then rename, so a crash mid-write cannot leave a truncated file behind.
      const temporary = `${filePath}.tmp`;
      await writeFile(temporary, safeStorage.encryptString(JSON.stringify(saved)), { mode: 0o600 });
      await rename(temporary, filePath);
    },
  };
}
