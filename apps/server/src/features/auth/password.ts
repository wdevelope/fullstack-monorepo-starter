import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;

/** OWASP가 권하는 scrypt 최소 비용이다. 테스트는 빨리 돌도록 더 낮은 비용을 넘긴다. */
export const PRODUCTION_COST = 2 ** 17;

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(stored: string, password: string): Promise<boolean>;
}

function derive(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { N: cost, r: BLOCK_SIZE, p: PARALLELISM, maxmem: 256 * cost * BLOCK_SIZE },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/**
 * 해시는 `scrypt$<cost>$<salt>$<key>` 형식으로 저장해 해시마다 자기 비용을 담는다.
 * 나중에 비용을 올려도 새 해시에만 적용되고, 옛 해시도 그대로 검증된다.
 */
export function createPasswordHasher(cost: number = PRODUCTION_COST): PasswordHasher {
  return {
    async hash(password) {
      const salt = randomBytes(SALT_LENGTH);
      const key = await derive(password, salt, cost);
      return ["scrypt", cost, salt.toString("base64url"), key.toString("base64url")].join("$");
    },

    async verify(stored, password) {
      const [scheme, storedCost, salt, key] = stored.split("$");
      if (scheme !== "scrypt" || !storedCost || !salt || !key) {
        throw new Error("알 수 없는 비밀번호 해시 형식이다");
      }
      const expected = Buffer.from(key, "base64url");
      const actual = await derive(password, Buffer.from(salt, "base64url"), Number(storedCost));
      return timingSafeEqual(actual, expected);
    },
  };
}
