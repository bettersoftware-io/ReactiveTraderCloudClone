import {
  findPasswordViolation,
  isConfirmationCode,
  isValidDisplayName,
  isValidEmail,
  normalizeDisplayName,
  normalizeEmail,
} from "@rtc/domain";
import type {
  ConfirmEmailRequestDto,
  RegisterRequestDto,
  ResetPasswordRequestDto,
} from "@rtc/shared";

import type { RateLimiter } from "../auth/rateLimit.js";
import type {
  AccountDirectory,
  AccountRecord,
  SignUpOutcome,
} from "./AccountDirectory.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
/** The send fuse counts every email the server asks for under one key. */
const SEND_FUSE_KEY = "all";

export interface AccountServiceOptions {
  readonly directory: AccountDirectory;
  readonly now: () => number;
  readonly registrationOpen: boolean;
  readonly maxRegistrationsPerDay: number;
  /** Charged once per real code guess, keyed by the normalized address and
   * shared by confirm and reset; the service never charges a request that
   * fails local validation. */
  readonly codeEntryLimiter: Pick<RateLimiter, "hit">;
  /** Charged once per email the service asks the directory to send, keyed
   * by the normalized address and shared by `/register`, `/resend-code` and
   * `/request-reset`; never charged for a request that fails validation. */
  readonly sendLimiter: Pick<RateLimiter, "hit">;
  /** One key for the whole server: every send, whatever the address. A fuse
   * set below the store's own email limit, so the server refuses honestly
   * (`unavailable`) instead of the store dropping mail silently. */
  readonly sendFuse: Pick<RateLimiter, "hit">;
}

type RegisterOutcome =
  | {
      readonly outcome: "code_sent" | "closed" | "throttled" | "unavailable";
    }
  | { readonly outcome: "invalid"; readonly rule: string };

type SendCodeOutcome = "code_sent" | "invalid" | "throttled" | "unavailable";

type ConfirmEmailOutcome =
  | {
      readonly outcome:
        | "confirmed"
        | "confirmed_unset"
        | "invalid_code"
        | "throttled"
        | "unavailable";
    }
  | { readonly outcome: "invalid"; readonly rule: string };

type ResetPasswordOutcome =
  | {
      readonly outcome:
        | "changed"
        | "invalid_code"
        | "throttled"
        | "unavailable";
    }
  | { readonly outcome: "invalid"; readonly rule: string };

type LoginDecision =
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
    request: ConfirmEmailRequestDto,
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

  /** The address's own budget first (`throttled`: the caller may be the
   * owner, and a registered and an unregistered address answer alike), then
   * the server-wide fuse (`unavailable`). */
  function chargeSend(email: string): "allowed" | "throttled" | "unavailable" {
    const at = options.now();

    if (!options.sendLimiter.hit(email, at)) {
      return "throttled";
    }

    return options.sendFuse.hit(SEND_FUSE_KEY, at) ? "allowed" : "unavailable";
  }

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

    const budget = chargeSend(email);

    if (budget !== "allowed") {
      return { outcome: budget };
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
      sent = await directory.signUp({ email, displayName }, callerIp);
    } finally {
      inFlight -= 1;
      answered += 1;
    }

    if (sent === "rejected-email") {
      return { outcome: "invalid", rule: "email" };
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

    const budget = chargeSend(email);

    if (budget !== "allowed") {
      return budget;
    }

    const sent = await directory.resendCode(email, callerIp);

    return sent === "sent" ? "code_sent" : "unavailable";
  }

  /** The request that proves the mailbox is the one that sets the password.
   * A weak password is refused before the directory is asked, so it does
   * not spend the code. */
  async function confirmEmail(
    request: ConfirmEmailRequestDto,
    callerIp: string,
  ): Promise<ConfirmEmailOutcome> {
    const email = readEmail(request.email);

    if (email === null || !isConfirmationCode(request.code)) {
      return { outcome: "invalid_code" };
    }

    const violation = findPasswordViolation(request.password);

    if (violation !== null) {
      return { outcome: "invalid", rule: violation.id };
    }

    if (!options.codeEntryLimiter.hit(email, options.now())) {
      return { outcome: "throttled" };
    }

    const confirmed = await directory.confirmEmail(
      email,
      request.code,
      request.password,
      callerIp,
    );

    return { outcome: confirmed };
  }

  async function requestReset(
    rawEmail: string,
    callerIp: string,
  ): Promise<SendCodeOutcome> {
    const email = readEmail(rawEmail);

    if (email === null) {
      return "invalid";
    }

    const budget = chargeSend(email);

    if (budget !== "allowed") {
      return budget;
    }

    const sent = await directory.requestReset(email, callerIp);

    return sent === "sent" ? "code_sent" : "unavailable";
  }

  async function resetPassword(
    request: ResetPasswordRequestDto,
    callerIp: string,
  ): Promise<ResetPasswordOutcome> {
    // Confirmation's order: the address and the code's shape first, then
    // the password rule — so both endpoints answer a malformed request alike.
    const email = readEmail(request.email);

    if (email === null || !isConfirmationCode(request.code)) {
      return { outcome: "invalid_code" };
    }

    const violation = findPasswordViolation(request.password);

    if (violation !== null) {
      return { outcome: "invalid", rule: violation.id };
    }

    if (!options.codeEntryLimiter.hit(email, options.now())) {
      return { outcome: "throttled" };
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
