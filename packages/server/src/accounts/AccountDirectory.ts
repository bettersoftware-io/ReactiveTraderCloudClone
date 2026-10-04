import type { AccessLevel } from "@rtc/domain";

/** Derived, never stored (spec §5.1). */
export type AccountStatus = "unconfirmed" | "pending" | "active" | "blocked";

export interface AccountRecord {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly access: AccessLevel;
  readonly status: AccountStatus;
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
  | "changed"
  | "invalid_code"
  | "rejected"
  | "unavailable";

export type PasswordCheck =
  | { readonly outcome: "match"; readonly accountId: string }
  | { readonly outcome: "invalid" | "unconfirmed" | "unavailable" };

export type AccountLookup =
  | { readonly outcome: "found"; readonly account: AccountRecord }
  | { readonly outcome: "missing" | "unavailable" };

export type RegistrationCount =
  | { readonly outcome: "counted"; readonly count: number }
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
  findAccount(accountId: string): Promise<AccountLookup>;
  countRegistrationsSince(sinceMs: number): Promise<RegistrationCount>;
  ping(): Promise<boolean>;
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
