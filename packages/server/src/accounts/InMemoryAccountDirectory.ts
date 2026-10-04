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
export const DEV_CONFIRMATION_CODE = "000000";

export interface InMemoryDirectoryOptions {
  readonly now: () => number;
  readonly seeds: readonly DevAccountSeed[];
}

interface Entry {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly access: AccessLevel;
  readonly createdAt: number;
  salt: Buffer;
  digest: Buffer;
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
  const signingUp = new Set<string>();
  const dummySalt = createSalt();

  for (const seed of options.seeds) {
    const salt = createSalt();

    byEmail.set(seed.email, {
      id: seed.id,
      email: seed.email,
      displayName: seed.displayName,
      access: seed.access,
      createdAt: 0,
      salt,
      digest: hashPasswordSync(DEV_ACCOUNT_PASSWORD, salt),
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

    async signUp(input: SignUpInput): Promise<SignUpOutcome> {
      // The address is claimed synchronously, before the hash is awaited, so
      // of two overlapping sign-ups the one that STARTED first wins, whole.
      if (byEmail.has(input.email) || signingUp.has(input.email)) {
        return "sent";
      }

      signingUp.add(input.email);

      try {
        const salt = createSalt();

        byEmail.set(input.email, {
          id: randomUUID(),
          email: input.email,
          displayName: input.displayName,
          access: "user",
          createdAt: options.now(),
          salt,
          digest: await hashPassword(input.password, salt),
          confirmed: false,
          approved: false,
          blocked: false,
          resetRequested: false,
        });
      } finally {
        signingUp.delete(input.email);
      }

      return "sent";
    },

    resendCode(): Promise<SendOutcome> {
      return Promise.resolve("sent");
    },

    confirmEmail(email: string, code: string): Promise<ConfirmOutcome> {
      const entry = byEmail.get(email);

      if (entry === undefined || entry.confirmed || !isDevCode(code)) {
        return Promise.resolve("invalid_code");
      }

      entry.confirmed = true;

      return Promise.resolve("confirmed");
    },

    async checkPassword(
      email: string,
      password: string,
    ): Promise<PasswordCheck> {
      const entry = byEmail.get(email);
      const candidate = await hashPassword(password, entry?.salt ?? dummySalt);

      if (entry === undefined || !digestsMatch(candidate, entry.digest)) {
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

      const salt = createSalt();

      entry.salt = salt;
      entry.digest = await hashPassword(password, salt);
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

function isDevCode(code: string): boolean {
  return code === DEV_CONFIRMATION_CODE;
}
