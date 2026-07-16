import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { findRosterUser } from "@rtc/domain";
import type { SessionUserDto } from "@rtc/shared";

import { signToken, verifyToken } from "./token.js";

export { parseAuthUsers } from "./loadUsers.js";

const SCRYPT_KEY_LENGTH = 32;
const SALT_LENGTH = 16;

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

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, SCRYPT_KEY_LENGTH);
}

export class AuthService {
  private readonly secret: string;
  readonly ttlMs: number;
  private readonly now: () => number;
  private readonly table: Map<string, CredentialRecord>;

  constructor(opts: AuthServiceOptions) {
    this.secret = opts.secret;
    this.ttlMs = opts.ttlMs;
    this.now = opts.now ?? ((): number => Date.now());
    this.table = new Map<string, CredentialRecord>();

    for (const [username, password] of opts.credentials) {
      const salt = randomBytes(SALT_LENGTH);
      const digest = hashPassword(password, salt);
      this.table.set(username, { salt, digest });
    }
  }

  login(username: string, password: string): LoginResult | null {
    const record = this.table.get(username);

    if (!record) {
      return null;
    }

    const candidate = hashPassword(password, record.salt);

    if (
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

  verifyToken(token: string): { username: string } | null {
    return verifyToken(token, this.secret, this.now());
  }
}
