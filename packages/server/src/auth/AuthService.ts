import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { findRosterUser } from "@rtc/domain";
import type { SessionUserDto } from "@rtc/shared";

import type { VerifiedToken } from "./token.js";
import { signToken, verifyToken } from "./token.js";

export { parseAuthUsers } from "./loadUsers.js";

const SCRYPT_KEY_LENGTH = 32;
const SALT_LENGTH = 16;

const scryptAsync = promisify(scrypt);

interface CredentialRecord {
  readonly salt: Buffer;
  readonly digest: Buffer;
}

export interface AuthServiceOptions {
  readonly secret: string;
  readonly ttlMs: number;
  readonly credentials: Map<string, string>;
  readonly now?: () => number;
}

interface LoginResult {
  readonly token: string;
  readonly user: SessionUserDto;
}

export class AuthService {
  private readonly secret: string;

  readonly ttlMs: number;

  private readonly now: () => number;

  private readonly table: Map<string, CredentialRecord>;

  /** Hashed against when the username is unknown, so an unknown and a known
   * username cost the same scrypt — a probe cannot tell them apart by
   * timing (the spec's low-impact note on S5). Per instance, never stored. */
  private readonly dummySalt: Buffer = randomBytes(SALT_LENGTH);

  constructor(opts: AuthServiceOptions) {
    if (opts.credentials.size > 0 && !opts.secret) {
      throw new Error("AUTH_SECRET must be set when AUTH_USERS is configured");
    }

    this.secret = opts.secret;
    this.ttlMs = opts.ttlMs;
    this.now =
      opts.now ??
      ((): number => {
        return Date.now();
      });
    this.table = new Map<string, CredentialRecord>();

    for (const [username, password] of opts.credentials) {
      const salt = randomBytes(SALT_LENGTH);
      const digest = hashPasswordSync(password, salt);
      this.table.set(username, { salt, digest });
    }
  }

  async login(username: string, password: string): Promise<LoginResult | null> {
    const record = this.table.get(username);
    const candidate = await hashPassword(
      password,
      record?.salt ?? this.dummySalt,
    );

    if (
      record === undefined ||
      candidate.length !== record.digest.length ||
      !timingSafeEqual(candidate, record.digest)
    ) {
      return null;
    }

    const entry = findRosterUser(username);

    if (!entry) {
      return null;
    }

    return {
      token: signToken(username, this.secret, this.ttlMs, this.now()),
      user: entry.user,
    };
  }

  verifyToken(token: string): VerifiedToken | null {
    return verifyToken(token, this.secret, this.now());
  }
}

/** Startup only: the table is built synchronously once from `AUTH_USERS`. */
function hashPasswordSync(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, SCRYPT_KEY_LENGTH);
}

/** S5 — every login hashes off the event loop (libuv threadpool), so a
 * burst of logins no longer stalls every live WebSocket's ticks. */
function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(password, salt, SCRYPT_KEY_LENGTH) as Promise<Buffer>;
}
