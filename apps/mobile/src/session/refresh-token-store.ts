import type { RefreshTokenStore } from "@starter/api-client";

/** The part of expo-secure-store this app uses. Injected so the adapter is testable without a device. */
export interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const REFRESH_TOKEN_KEY = "starter.refresh-token";

/** Keeps the refresh token in the Keychain (iOS) or Keystore-backed storage (Android). */
export function createRefreshTokenStore(storage: SecureStorage): RefreshTokenStore {
  return {
    get: () => storage.getItemAsync(REFRESH_TOKEN_KEY),
    set: (token) =>
      token === null
        ? storage.deleteItemAsync(REFRESH_TOKEN_KEY)
        : storage.setItemAsync(REFRESH_TOKEN_KEY, token),
  };
}
