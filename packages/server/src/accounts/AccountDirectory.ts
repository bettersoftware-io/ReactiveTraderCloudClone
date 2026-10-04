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

export interface SignUpInput {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

export type SignUpOutcome =
  | "sent"
  | "rejected-email"
  | "rejected-password"
  | "unavailable";

export type SendOutcome = "sent" | "unavailable";

export type ConfirmOutcome = "confirmed" | "invalid_code" | "unavailable";

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
  confirmEmail(
    email: string,
    code: string,
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
