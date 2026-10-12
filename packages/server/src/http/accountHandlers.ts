import {
  type AccountErrorDto,
  type AccountFlowResponseDto,
  type AccountFlowStatus,
  isConfirmEmailRequestDto,
  isEmailRequestDto,
  isRegisterRequestDto,
  isResetPasswordRequestDto,
} from "@rtc/shared";

import type { AccountService } from "../accounts/AccountService.js";
import type { BanList } from "../auth/banList.js";
import type { RateLimiter } from "../auth/rateLimit.js";
import { type HttpResult, jsonResult } from "./jsonResult.js";

export interface AccountRateLimits {
  readonly register: RateLimiter;
  readonly resendCode: RateLimiter;
  readonly confirmEmail: RateLimiter;
  readonly requestReset: RateLimiter;
  readonly resetPassword: RateLimiter;
}

export interface AccountHandlerDeps {
  readonly accounts: AccountService;
  readonly banList: BanList;
  readonly limits: AccountRateLimits;
  readonly now: () => number;
}

/** `POST /register`. Answers `code_sent` for a new AND an existing address,
 * so it never reveals who is registered. */
export async function registerAccount(
  bodyText: string,
  ip: string,
  deps: AccountHandlerDeps,
): Promise<HttpResult> {
  const admitted = admit(
    bodyText,
    ip,
    deps.limits.register,
    isRegisterRequestDto,
    deps,
  );

  if (!admitted.ok) {
    return admitted.result;
  }

  const result = await deps.accounts.register(admitted.dto, ip);

  if (result.outcome === "invalid") {
    return errorResult(400, { error: "invalid_request", rule: result.rule });
  }

  if (result.outcome === "closed") {
    return errorResult(403, { error: "registration_closed" });
  }

  if (result.outcome === "throttled") {
    return throttledResult();
  }

  return result.outcome === "code_sent"
    ? flowResult(202, "code_sent")
    : errorResult(503, { error: "unavailable" });
}

/** `POST /resend-code`. */
export async function resendConfirmationCode(
  bodyText: string,
  ip: string,
  deps: AccountHandlerDeps,
): Promise<HttpResult> {
  const admitted = admit(
    bodyText,
    ip,
    deps.limits.resendCode,
    isEmailRequestDto,
    deps,
  );

  if (!admitted.ok) {
    return admitted.result;
  }

  return sendCodeResult(await deps.accounts.resendCode(admitted.dto.email, ip));
}

/** `POST /confirm-email`: proves the mailbox and sets the password. A wrong
 * code is a ban strike; a weak password is not. */
export async function confirmEmailAddress(
  bodyText: string,
  ip: string,
  deps: AccountHandlerDeps,
): Promise<HttpResult> {
  const admitted = admit(
    bodyText,
    ip,
    deps.limits.confirmEmail,
    isConfirmEmailRequestDto,
    deps,
  );

  if (!admitted.ok) {
    return admitted.result;
  }

  const result = await deps.accounts.confirmEmail(admitted.dto, ip);

  if (result.outcome === "invalid") {
    return errorResult(400, { error: "invalid_request", rule: result.rule });
  }

  if (result.outcome === "throttled") {
    return throttledResult();
  }

  if (result.outcome === "invalid_code") {
    return refuseCode(ip, deps);
  }

  if (result.outcome === "confirmed_unset") {
    return flowResult(200, "password_unset");
  }

  return result.outcome === "confirmed"
    ? flowResult(200, "pending_approval")
    : errorResult(503, { error: "unavailable" });
}

/** `POST /request-reset`. */
export async function requestPasswordReset(
  bodyText: string,
  ip: string,
  deps: AccountHandlerDeps,
): Promise<HttpResult> {
  const admitted = admit(
    bodyText,
    ip,
    deps.limits.requestReset,
    isEmailRequestDto,
    deps,
  );

  if (!admitted.ok) {
    return admitted.result;
  }

  return sendCodeResult(
    await deps.accounts.requestReset(admitted.dto.email, ip),
  );
}

/** `POST /reset-password`. A wrong code is a ban strike; a weak password is not. */
export async function resetAccountPassword(
  bodyText: string,
  ip: string,
  deps: AccountHandlerDeps,
): Promise<HttpResult> {
  const admitted = admit(
    bodyText,
    ip,
    deps.limits.resetPassword,
    isResetPasswordRequestDto,
    deps,
  );

  if (!admitted.ok) {
    return admitted.result;
  }

  const result = await deps.accounts.resetPassword(admitted.dto, ip);

  if (result.outcome === "invalid") {
    return errorResult(400, { error: "invalid_request", rule: result.rule });
  }

  if (result.outcome === "throttled") {
    return throttledResult();
  }

  if (result.outcome === "invalid_code") {
    return refuseCode(ip, deps);
  }

  return result.outcome === "changed"
    ? flowResult(200, "password_changed")
    : errorResult(503, { error: "unavailable" });
}

type Admission<T> =
  | { readonly ok: true; readonly dto: T }
  | { readonly ok: false; readonly result: HttpResult };

/**
 * The checks every account endpoint shares, cheapest first: the ban list (a
 * Map lookup — a banned caller never reaches JSON parsing), the per-IP rate
 * limit (a hit is a strike), then the JSON and its shape.
 */
function admit<T>(
  bodyText: string,
  ip: string,
  limiter: RateLimiter,
  isDto: (value: unknown) => value is T,
  deps: AccountHandlerDeps,
): Admission<T> {
  const now = deps.now();
  const bannedUntil = deps.banList.bannedUntil(ip, now);

  if (bannedUntil !== null) {
    return {
      ok: false,
      result: jsonResult(
        429,
        { error: "banned" },
        { "Retry-After": String(Math.ceil((bannedUntil - now) / 1_000)) },
      ),
    };
  }

  if (!limiter.hit(ip, now)) {
    deps.banList.strike(ip, "account-rate-limited", now);

    return { ok: false, result: errorResult(429, { error: "rate_limited" }) };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { ok: false, result: errorResult(400, { error: "malformed_json" }) };
  }

  if (!isDto(parsed)) {
    return {
      ok: false,
      result: errorResult(400, { error: "invalid_request" }),
    };
  }

  return { ok: true, dto: parsed };
}

/** The address's own code-entry or send budget is spent. NOT a ban strike:
 * the caller may be the address's real owner. */
function throttledResult(): HttpResult {
  return errorResult(429, { error: "rate_limited" });
}

function refuseCode(ip: string, deps: AccountHandlerDeps): HttpResult {
  deps.banList.strike(ip, "code-failed", deps.now());

  return errorResult(400, { error: "invalid_code" });
}

function sendCodeResult(
  outcome: "code_sent" | "invalid" | "throttled" | "unavailable",
): HttpResult {
  if (outcome === "invalid") {
    return errorResult(400, { error: "invalid_request", rule: "email" });
  }

  if (outcome === "throttled") {
    return throttledResult();
  }

  return outcome === "code_sent"
    ? flowResult(202, "code_sent")
    : errorResult(503, { error: "unavailable" });
}

function flowResult(status: number, flow: AccountFlowStatus): HttpResult {
  const body: AccountFlowResponseDto = { status: flow };

  return jsonResult(status, body);
}

function errorResult(status: number, body: AccountErrorDto): HttpResult {
  return jsonResult(status, body);
}
