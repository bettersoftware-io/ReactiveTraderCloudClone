import { randomUUID } from "node:crypto";

import type { AccessLevel } from "@rtc/domain";

import {
  createSalt,
  digestsMatch,
  hashPassword,
  hashPasswordSync,
} from "../auth/passwordHash.js";
import {
  type AccountDirectory,
  type AccountLookup,
  type ConfirmOutcome,
  deriveAccountStatus,
  type PasswordCheck,
  type RegistrationCount,
  type ResetOutcome,
  type SendOutcome,
  type SignUpInput,
  type SignUpOutcome,
} from "./AccountDirectory.js";
import { DEV_ACCOUNT_PASSWORD, type DevAccountSeed } from "./devAccounts.js";

/** The code every dev confirmation and reset accepts. There is no mailbox. */
export const DEV_CONFIRMATION_CODE = "00000000";

/** Derives a digest from a password and a salt (scrypt by default). */
export type PasswordHash = (password: string, salt: Buffer) => Promise<Buffer>;

export interface InMemoryDirectoryOptions {
  readonly now: () => number;
  readonly seeds: readonly DevAccountSeed[];
  /** Defaults to `hashPassword`; a test injects a failing one. */
  readonly hash?: PasswordHash;
}

interface Credential {
  readonly salt: Buffer;
  readonly digest: Buffer;
}

interface Entry {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly access: AccessLevel;
  readonly createdAt: number;
  /** Null from sign-up until the confirmation (or a reset) sets one: the
   * stand-in for Supabase's random sign-up password nobody knows. */
  credential: Credential | null;
  confirmed: boolean;
  approved: boolean;
  blocked: boolean;
  resetRequested: boolean;
}

/**
 * The account directory for local dev and e2e (`RTC_DEV_ACCOUNTS=1`): a Map,
 * scrypt hashes, one fixed code. It mirrors the Supabase adapter's observable
 * behaviour — an existing address signs up as `sent`, an unknown address and
 * a wrong password are both `invalid` — so the policy above it is exercised
 * the same way against either.
 */
export function createInMemoryAccountDirectory(
  options: InMemoryDirectoryOptions,
): AccountDirectory {
  const byEmail = new Map<string, Entry>();
  const hash = options.hash ?? hashPassword;
  const dummySalt = createSalt();

  for (const seed of options.seeds) {
    const salt = createSalt();

    byEmail.set(seed.email, {
      id: seed.id,
      email: seed.email,
      displayName: seed.displayName,
      access: seed.access,
      createdAt: 0,
      credential: {
        salt,
        digest: hashPasswordSync(DEV_ACCOUNT_PASSWORD, salt),
      },
      confirmed: seed.status !== "unconfirmed",
      approved: seed.status === "active",
      blocked: seed.status === "blocked",
      resetRequested: false,
    });
  }

  function findById(accountId: string): Entry | undefined {
    for (const entry of byEmail.values()) {
      if (entry.id === accountId) {
        return entry;
      }
    }

    return undefined;
  }

  return {
    kind: "in-memory",

    signUp(input: SignUpInput): Promise<SignUpOutcome> {
      // Checked and claimed in one synchronous turn — nothing is awaited in
      // between — so of two overlapping sign-ups the first wins, whole, and
      // a repeat for an existing address changes nothing.
      if (!byEmail.has(input.email)) {
        byEmail.set(input.email, {
          id: randomUUID(),
          email: input.email,
          displayName: input.displayName,
          access: "user",
          createdAt: options.now(),
          credential: null,
          confirmed: false,
          approved: false,
          blocked: false,
          resetRequested: false,
        });
      }

      return Promise.resolve("sent");
    },

    resendCode(): Promise<SendOutcome> {
      return Promise.resolve("sent");
    },

    async confirmEmail(
      email: string,
      code: string,
      password: string,
    ): Promise<ConfirmOutcome> {
      const entry = byEmail.get(email);

      if (entry === undefined || entry.confirmed || !isDevCode(code)) {
        return "invalid_code";
      }

      let credential: Credential;

      try {
        credential = await createCredential(password, hash);
      } catch {
        return "unavailable";
      }

      // Re-checked after the await, then applied in one synchronous step: a
      // concurrent confirmation that finished first has spent the code.
      if (entry.confirmed) {
        return "invalid_code";
      }

      entry.credential = credential;
      entry.confirmed = true;

      return "confirmed";
    },

    async checkPassword(
      email: string,
      password: string,
    ): Promise<PasswordCheck> {
      const entry = byEmail.get(email);
      const credential = entry?.credential ?? null;
      // One hash whether or not a password exists: an unknown address and an
      // account with none yet cost and answer the same as a wrong password.
      const candidate = await hash(password, credential?.salt ?? dummySalt);

      if (
        entry === undefined ||
        credential === null ||
        !digestsMatch(candidate, credential.digest)
      ) {
        return { outcome: "invalid" };
      }

      return entry.confirmed
        ? { outcome: "match", accountId: entry.id }
        : { outcome: "unconfirmed" };
    },

    requestReset(email: string): Promise<SendOutcome> {
      const entry = byEmail.get(email);

      if (entry !== undefined) {
        entry.resetRequested = true;
      }

      return Promise.resolve("sent");
    },

    async resetPassword(
      email: string,
      code: string,
      password: string,
    ): Promise<ResetOutcome> {
      const entry = byEmail.get(email);

      if (entry === undefined || !entry.resetRequested || !isDevCode(code)) {
        return "invalid_code";
      }

      let credential: Credential;

      try {
        credential = await createCredential(password, hash);
      } catch {
        return "unavailable";
      }

      if (!entry.resetRequested) {
        return "invalid_code";
      }

      // A recovery code proves the mailbox, so it confirms an unconfirmed
      // address — as Supabase's recovery verification does.
      entry.credential = credential;
      entry.confirmed = true;
      entry.resetRequested = false;

      return "changed";
    },

    findAccount(accountId: string): Promise<AccountLookup> {
      const entry = findById(accountId);

      if (entry === undefined) {
        return Promise.resolve({ outcome: "missing" });
      }

      return Promise.resolve({
        outcome: "found",
        account: {
          id: entry.id,
          email: entry.email,
          displayName: entry.displayName,
          access: entry.access,
          status: deriveAccountStatus(entry),
        },
      });
    },

    countRegistrationsSince(sinceMs: number): Promise<RegistrationCount> {
      let count = 0;

      for (const entry of byEmail.values()) {
        if (entry.createdAt >= sinceMs) {
          count += 1;
        }
      }

      return Promise.resolve({ outcome: "counted", count });
    },

    ping(): Promise<boolean> {
      return Promise.resolve(true);
    },
  };
}

async function createCredential(
  password: string,
  hash: PasswordHash,
): Promise<Credential> {
  const salt = createSalt();

  return { salt, digest: await hash(password, salt) };
}

function isDevCode(code: string): boolean {
  return code === DEV_CONFIRMATION_CODE;
}
