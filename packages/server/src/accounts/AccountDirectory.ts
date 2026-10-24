import type { AccessLevel, AccountStatus } from "@rtc/domain";

export interface AccountRecord {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly access: AccessLevel;
  readonly status: AccountStatus;
  /** Epoch ms the account was created. */
  readonly createdAt: number;
  /** Epoch ms before which no session of this account counts; null when
   * none was ever stamped. Always the SERVER's clock, never the store's. */
  readonly sessionsNotBefore: number | null;
}

/**
 * No password: a sign-up does not prove the mailbox, so a password chosen
 * here could be a squatter's (account pre-hijacking). The store keeps a
 * random one nobody knows; `confirmEmail`, which carries the emailed code,
 * sets the real one.
 */
export interface SignUpInput {
  readonly email: string;
  readonly displayName: string;
}

export type SignUpOutcome = "sent" | "rejected-email" | "unavailable";

export type SendOutcome = "sent" | "unavailable";

/**
 * `confirmed`: the code was valid and the password is now the given one.
 * `confirmed_unset`: the code was valid (and is spent) and the email is
 * confirmed, but the password was NOT stored.
 */
export type ConfirmOutcome =
  | "confirmed"
  | "confirmed_unset"
  | "invalid_code"
  | "unavailable";

export type ResetOutcome =
  | {
      readonly outcome: "changed";
      /** The account whose password changed, when the store says which. */
      readonly accountId: string | null;
    }
  | "invalid_code"
  | "rejected"
  | "unavailable";

export type PasswordCheck =
  | { readonly outcome: "match"; readonly accountId: string }
  | { readonly outcome: "invalid" | "unconfirmed" | "unavailable" };

export type AccountLookup =
  | { readonly outcome: "found"; readonly account: AccountRecord }
  | { readonly outcome: "missing" | "unavailable" };

export type PurgeOutcome =
  | { readonly outcome: "purged"; readonly count: number }
  | { readonly outcome: "unavailable" };

export type RegistrationCount =
  | { readonly outcome: "counted"; readonly count: number }
  | { readonly outcome: "unavailable" };

/** What an admin write answered: it landed, the account does not exist, or
 * the store could not say. */
export type AdminWrite = "ok" | "not_found" | "unavailable";

export type AccountListing =
  | { readonly outcome: "listed"; readonly accounts: readonly AccountRecord[] }
  | { readonly outcome: "unavailable" };

export interface AccountFlags {
  readonly confirmed: boolean;
  readonly approved: boolean;
  readonly blocked: boolean;
}

/**
 * Where accounts live. Every method resolves; none rejects — an unreachable
 * store is the value `unavailable`, so a caller cannot forget to handle it.
 * Emails arrive already normalized (`AccountService`). `callerIp` is the
 * end user's address, for a store that rate-limits per caller.
 */
export interface AccountDirectory {
  readonly kind: "supabase" | "in-memory" | "disabled";
  signUp(input: SignUpInput, callerIp: string): Promise<SignUpOutcome>;
  resendCode(email: string, callerIp: string): Promise<SendOutcome>;
  /** Proves the mailbox with the emailed code and, with that proof, sets
   * the account's password. */
  confirmEmail(
    email: string,
    code: string,
    password: string,
    callerIp: string,
  ): Promise<ConfirmOutcome>;
  checkPassword(
    email: string,
    password: string,
    callerIp: string,
  ): Promise<PasswordCheck>;
  requestReset(email: string, callerIp: string): Promise<SendOutcome>;
  resetPassword(
    email: string,
    code: string,
    password: string,
    callerIp: string,
  ): Promise<ResetOutcome>;
  /** Must be bounded in time (a timeout reads as `unavailable`): the status
   * cache shares ONE in-flight lookup per account, so a lookup that never
   * settles would hold every upgrade for that account. */
  findAccount(accountId: string): Promise<AccountLookup>;
  /** The account for a normalized address; the same cost whether or not one
   * exists, so a caller's timing says nothing about the address. */
  findByEmail(email: string): Promise<AccountLookup>;
  /** Deletes up to `limit` accounts never confirmed and created before
   * `cutoffMs`, oldest first. `purged` with a partial count when a delete
   * fails mid-run: the next run continues. */
  purgeUnconfirmedBefore(
    cutoffMs: number,
    limit: number,
  ): Promise<PurgeOutcome>;
  /** Must include every sign-up this directory has already answered — the
   * service adds to the count only the sign-ups still in flight and those
   * answered while the count was being read. */
  countRegistrationsSince(sinceMs: number): Promise<RegistrationCount>;
  ping(): Promise<boolean>;
  /** Up to `limit` accounts, newest first. */
  listAccounts(limit: number): Promise<AccountListing>;
  /** Sets `approved`. */
  setApproved(accountId: string): Promise<AdminWrite>;
  /** Sets `blocked`. Blocking also stamps `sessionsNotBefore` with
   * `stampAtMs` in the same write, so a later unblock does not bring the
   * old tokens back; unblocking stamps nothing. */
  setBlocked(
    accountId: string,
    blocked: boolean,
    stampAtMs: number,
  ): Promise<AdminWrite>;
  /** Renames and stamps `sessionsNotBefore` in one write (atomic). */
  rename(
    accountId: string,
    displayName: string,
    stampAtMs: number,
  ): Promise<AdminWrite>;
  deleteAccount(accountId: string): Promise<AdminWrite>;
  /** Writes `sessionsNotBefore` alone. */
  revokeSessions(accountId: string, stampAtMs: number): Promise<AdminWrite>;
}

/** A block wins over everything; then an unconfirmed email; then approval. */
export function deriveAccountStatus(flags: AccountFlags): AccountStatus {
  if (flags.blocked) {
    return "blocked";
  }

  if (!flags.confirmed) {
    return "unconfirmed";
  }

  return flags.approved ? "active" : "pending";
}
