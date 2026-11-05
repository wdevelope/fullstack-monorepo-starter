import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;

/** OWASP's minimum scrypt cost. Tests pass a lower cost so the suite stays fast. */
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
 * Hashes are stored as `scrypt$<cost>$<salt>$<key>` so each hash carries its own cost.
 * Raising the cost later only affects new hashes; old ones still verify.
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
        throw new Error("Unknown password hash format");
      }
      const expected = Buffer.from(key, "base64url");
      const actual = await derive(password, Buffer.from(salt, "base64url"), Number(storedCost));
      return timingSafeEqual(actual, expected);
    },
  };
}
