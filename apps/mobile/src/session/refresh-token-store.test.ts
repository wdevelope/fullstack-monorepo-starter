import { describe, expect, it } from "vitest";

import {
  createRefreshTokenStore,
  REFRESH_TOKEN_KEY,
  type SecureStorage,
} from "./refresh-token-store";

function fakeSecureStorage() {
  const values = new Map<string, string>();
  const storage: SecureStorage = {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
  };
  return { values, storage };
}

describe("refresh token store", () => {
  it("reads null when no token was stored", async () => {
    const { storage } = fakeSecureStorage();

    expect(await createRefreshTokenStore(storage).get()).toBeNull();
  });

  it("keeps the latest token under one key", async () => {
    const { storage, values } = fakeSecureStorage();
    const store = createRefreshTokenStore(storage);

    await store.set("refresh-0");
    await store.set("refresh-1");

    expect(await store.get()).toBe("refresh-1");
    expect([...values.keys()]).toEqual([REFRESH_TOKEN_KEY]);
  });

  it("AUTH-17 deletes the stored token when the session is cleared", async () => {
    const { storage, values } = fakeSecureStorage();
    const store = createRefreshTokenStore(storage);
    await store.set("refresh-0");

    await store.set(null);

    expect(values.size).toBe(0);
    expect(await store.get()).toBeNull();
  });
});
