import type { RefreshTokenStore } from "@starter/api-client";

/** 이 앱이 쓰는 expo-secure-store의 일부. 기기 없이도 어댑터를 테스트할 수 있도록 주입한다. */
export interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const REFRESH_TOKEN_KEY = "starter.refresh-token";

/** 리프레시 토큰을 Keychain(iOS)이나 Keystore 기반 저장소(Android)에 둔다. */
export function createRefreshTokenStore(storage: SecureStorage): RefreshTokenStore {
  return {
    get: () => storage.getItemAsync(REFRESH_TOKEN_KEY),
    set: (token) =>
      token === null
        ? storage.deleteItemAsync(REFRESH_TOKEN_KEY)
        : storage.setItemAsync(REFRESH_TOKEN_KEY, token),
  };
}
