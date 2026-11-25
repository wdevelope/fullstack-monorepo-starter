import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { RefreshTokenStore } from "@starter/api-client";

/** 이 저장소에 필요한 Electron `safeStorage`의 일부. 테스트는 가짜를 넘긴다. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface SafeStorageTokenStoreOptions {
  safeStorage: SafeStorageLike;
  /** 암호화된 파일. 보통 `app.getPath("userData")` 아래에 있다. */
  filePath: string;
  /** 토큰이 속한 서버. 토큰은 그것을 발급한 서버에 대해서만 돌려준다. */
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
 * 리프레시 토큰을 OS 키체인으로(`safeStorage`를 거쳐) 암호화해 보관한다. 암호화를 쓸 수 없으면
 * 토큰은 메모리에만 있다. 디스크에 평문 토큰을 두는 대신 다시 시작한 뒤 사용자가 다시 로그인한다.
 */
export function createSafeStorageTokenStore(
  options: SafeStorageTokenStoreOptions,
): RefreshTokenStore {
  const { safeStorage, filePath, apiUrl } = options;
  // undefined는 "아직 디스크에서 읽지 않음", null은 "토큰 없음"이다.
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
      // 아래에서 처리한다: 깨졌거나 OS에 더는 없는 키로 암호화된 경우다.
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
        // 평문은 절대 쓰지 않는다. 옛 파일을 지우면 이미 회전한 토큰이 다음 실행 때 다시 쓰이는 일도 막는다.
        // 서버는 그것을 탈취로 본다.
        await rm(filePath, { force: true });
        return;
      }
      const saved: Saved = { apiUrl, refreshToken: token };
      await mkdir(dirname(filePath), { recursive: true });
      // 쓴 다음 이름을 바꾼다. 그래서 쓰는 도중에 죽어도 잘린 파일이 남지 않는다.
      const temporary = `${filePath}.tmp`;
      await writeFile(temporary, safeStorage.encryptString(JSON.stringify(saved)), { mode: 0o600 });
      await rename(temporary, filePath);
    },
  };
}
