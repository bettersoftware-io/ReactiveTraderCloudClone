import {
  findPasswordViolation,
  isConfirmationCode,
  isValidDisplayName,
  isValidEmail,
  normalizeDisplayName,
  normalizeEmail,
} from "@rtc/domain";
import type { RegisterRequestDto, ResetPasswordRequestDto } from "@rtc/shared";

import type {
  AccountDirectory,
  AccountRecord,
  SignUpOutcome,
} from "./AccountDirectory.js";

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface AccountServiceOptions {
  readonly directory: AccountDirectory;
  readonly now: () => number;
  readonly registrationOpen: boolean;
  readonly maxRegistrationsPerDay: number;
}

export type RegisterOutcome =
  | { readonly outcome: "code_sent" | "closed" | "unavailable" }
  | { readonly outcome: "invalid"; readonly rule: string };

export type SendCodeOutcome = "code_sent" | "invalid" | "unavailable";

export type ConfirmEmailOutcome = "confirmed" | "invalid_code" | "unavailable";

export type ResetPasswordOutcome =
  | { readonly outcome: "changed" | "invalid_code" | "unavailable" }
  | { readonly outcome: "invalid"; readonly rule: string };

export type LoginDecision =
  | { readonly outcome: "ok"; readonly account: AccountRecord }
  | {
      readonly outcome:
        | "invalid"
        | "unconfirmed"
        | "pending"
        | "blocked"
        | "unavailable";
    };

export interface AccountService {
  register(
    request: RegisterRequestDto,
    callerIp: string,
  ): Promise<RegisterOutcome>;
  resendCode(rawEmail: string, callerIp: string): Promise<SendCodeOutcome>;
  confirmEmail(
    rawEmail: string,
    code: string,
    callerIp: string,
  ): Promise<ConfirmEmailOutcome>;
  requestReset(rawEmail: string, callerIp: string): Promise<SendCodeOutcome>;
  resetPassword(
    request: ResetPasswordRequestDto,
    callerIp: string,
  ): Promise<ResetPasswordOutcome>;
  login(
    rawEmail: string,
    password: string,
    callerIp: string,
  ): Promise<LoginDecision>;
}

/**
 * The account policy (spec §5.4, §5.7), over whichever directory is
 * configured. Three rules live here and nowhere else: an address is
 * normalized before any lookup; registration can be closed or capped per
 * day (exact within one server process; approximate across several
 * machines, which only share the directory's count); and a login succeeds only for an `active` account, with the reason
 * it did not revealed only after the password was right.
 */
export function createAccountService(
  options: AccountServiceOptions,
): AccountService {
  const { directory } = options;
  /** Sign-ups sent to the directory and not yet answered. */
  let inFlight = 0;
  /** Sign-ups answered since start; only ever grows. */
  let answered = 0;

  async function register(
    request: RegisterRequestDto,
    callerIp: string,
  ): Promise<RegisterOutcome> {
    if (!options.registrationOpen) {
      return { outcome: "closed" };
    }

    const email = readEmail(request.email);

    if (email === null) {
      return { outcome: "invalid", rule: "email" };
    }

    const displayName = normalizeDisplayName(request.displayName);

    if (!isValidDisplayName(displayName)) {
      return { outcome: "invalid", rule: "display-name" };
    }

    const violation = findPasswordViolation(request.password);

    if (violation !== null) {
      return { outcome: "invalid", rule: violation.id };
    }

    const answeredBefore = answered;
    const counted = await directory.countRegistrationsSince(
      options.now() - DAY_MS,
    );

    if (counted.outcome === "unavailable") {
      return { outcome: "unavailable" };
    }

    // Sign-ups the count may not include: those still in flight, and those
    // answered while the count was being read. Over-counting only closes early.
    const uncounted = inFlight + (answered - answeredBefore);

    if (counted.count + uncounted >= options.maxRegistrationsPerDay) {
      return { outcome: "closed" };
    }

    inFlight += 1;

    let sent: SignUpOutcome;

    try {
      sent = await directory.signUp(
        { email, displayName, password: request.password },
        callerIp,
      );
    } finally {
      inFlight -= 1;
      answered += 1;
    }

    if (sent === "rejected-email") {
      return { outcome: "invalid", rule: "email" };
    }

    if (sent === "rejected-password") {
      return { outcome: "invalid", rule: "password" };
    }

    return { outcome: sent === "sent" ? "code_sent" : "unavailable" };
  }

  async function resendCode(
    rawEmail: string,
    callerIp: string,
  ): Promise<SendCodeOutcome> {
    const email = readEmail(rawEmail);

    if (email === null) {
      return "invalid";
    }

    const sent = await directory.resendCode(email, callerIp);

    return sent === "sent" ? "code_sent" : "unavailable";
  }

  async function confirmEmail(
    rawEmail: string,
    code: string,
    callerIp: string,
  ): Promise<ConfirmEmailOutcome> {
    const email = readEmail(rawEmail);

    if (email === null || !isConfirmationCode(code)) {
      return "invalid_code";
    }

    return directory.confirmEmail(email, code, callerIp);
  }

  async function requestReset(
    rawEmail: string,
    callerIp: string,
  ): Promise<SendCodeOutcome> {
    const email = readEmail(rawEmail);

    if (email === null) {
      return "invalid";
    }

    const sent = await directory.requestReset(email, callerIp);

    return sent === "sent" ? "code_sent" : "unavailable";
  }

  async function resetPassword(
    request: ResetPasswordRequestDto,
    callerIp: string,
  ): Promise<ResetPasswordOutcome> {
    const violation = findPasswordViolation(request.password);

    if (violation !== null) {
      return { outcome: "invalid", rule: violation.id };
    }

    const email = readEmail(request.email);

    if (email === null || !isConfirmationCode(request.code)) {
      return { outcome: "invalid_code" };
    }

    const changed = await directory.resetPassword(
      email,
      request.code,
      request.password,
      callerIp,
    );

    if (changed === "rejected") {
      return { outcome: "invalid", rule: "password" };
    }

    return { outcome: changed };
  }

  async function login(
    rawEmail: string,
    password: string,
    callerIp: string,
  ): Promise<LoginDecision> {
    const email = readEmail(rawEmail);

    if (email === null) {
      return { outcome: "invalid" };
    }

    const check = await directory.checkPassword(email, password, callerIp);

    if (check.outcome !== "match") {
      return { outcome: check.outcome };
    }

    const found = await directory.findAccount(check.accountId);

    if (found.outcome === "unavailable") {
      return { outcome: "unavailable" };
    }

    if (found.outcome !== "found") {
      return { outcome: "invalid" };
    }

    if (found.account.status !== "active") {
      return { outcome: found.account.status };
    }

    return { outcome: "ok", account: found.account };
  }

  return {
    register,
    resendCode,
    confirmEmail,
    requestReset,
    resetPassword,
    login,
  };
}

/** The one place an address is normalized; null when it is not an address. */
function readEmail(raw: string): string | null {
  const email = normalizeEmail(raw);

  return isValidEmail(email) ? email : null;
}
