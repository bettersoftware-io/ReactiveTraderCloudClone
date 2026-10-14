import type { Observable } from "rxjs";

import type { AccountInputRule } from "../auth/accountInput.js";
import type { SessionUser } from "../auth/sessionUser.js";

/** Why a sign-in was refused. The last three are only ever said after a
 * correct password (the server's rule, spec §5.4), so they reveal nothing
 * to a guesser. */
export type AuthFailureReason =
  | "invalid"
  | "unavailable"
  | "unconfirmed"
  | "pending"
  | "blocked";

export type AuthOutcome =
  | {
      readonly ok: true;
      readonly token: string;
      readonly user: SessionUser;
      readonly exp: number;
    }
  | { readonly ok: false; readonly reason: AuthFailureReason };

/** What an account flow answered: `code_sent` from a registration, a resend
 * or a reset request; `pending_approval` or `password_unset` from a
 * confirmation; `password_changed` from a reset. The wire spells the same
 * words (`AccountFlowResponseDto`). */
export type AccountFlowStatus =
  | "code_sent"
  | "pending_approval"
  | "password_changed"
  | "password_unset";

/** Why an account flow was refused. `invalid_input` carries the rule that
 * failed; `rate_limited` covers the per-IP limit, the per-address budget and
 * a ban alike (wait, then retry); `unavailable` is everything the user
 * cannot act on — the store down, the origin refused, a malformed answer. */
export type AccountFlowFailure =
  | "invalid_input"
  | "invalid_code"
  | "registration_closed"
  | "rate_limited"
  | "unavailable";

export type AccountFlowOutcome =
  | { readonly ok: true; readonly status: AccountFlowStatus }
  | {
      readonly ok: false;
      readonly reason: AccountFlowFailure;
      readonly rule?: AccountInputRule;
    };

export interface AuthPort {
  login(username: string, password: string): Observable<AuthOutcome>;
  /** Starts a registration. No password yet: one chosen before the mailbox
   * is proven could be an attacker's (spec §5.3); `confirmEmail` sets it.
   * Answers `code_sent` for a new and a known address alike. */
  register(email: string, displayName: string): Observable<AccountFlowOutcome>;
  resendCode(email: string): Observable<AccountFlowOutcome>;
  /** Proves the mailbox and sets the password in one request. */
  confirmEmail(
    email: string,
    code: string,
    password: string,
  ): Observable<AccountFlowOutcome>;
  requestPasswordReset(email: string): Observable<AccountFlowOutcome>;
  resetPassword(
    email: string,
    code: string,
    password: string,
  ): Observable<AccountFlowOutcome>;
}

/** The five account flows without `login` — what the `accountAccess`
 * machine is built on, and what `AuthPresenter.accounts` exposes. */
export type AccountFlowPort = Omit<AuthPort, "login">;
