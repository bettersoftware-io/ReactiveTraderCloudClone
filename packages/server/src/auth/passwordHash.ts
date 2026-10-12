import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const SCRYPT_KEY_LENGTH = 32;
const SALT_LENGTH = 16;

const scryptAsync = promisify(scrypt);

export function createSalt(): Buffer {
  return randomBytes(SALT_LENGTH);
}

/** Startup only: a table built synchronously once. */
export function hashPasswordSync(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, SCRYPT_KEY_LENGTH);
}

/** S5 — hashes off the event loop (libuv threadpool), so a burst of logins
 * does not stall every live WebSocket's ticks. */
export function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(password, salt, SCRYPT_KEY_LENGTH) as Promise<Buffer>;
}

export function digestsMatch(candidate: Buffer, digest: Buffer): boolean {
  return (
    candidate.length === digest.length && timingSafeEqual(candidate, digest)
  );
}
