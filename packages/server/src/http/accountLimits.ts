import type { SendFuses } from "../accounts/AccountService.js";
import { createRateLimiter, type RateLimiter } from "../auth/rateLimit.js";
import {
  CODE_ENTRY_PER_ADDRESS_MAX,
  CODE_ENTRY_PER_ADDRESS_MAX_KEYS,
  CODE_ENTRY_PER_ADDRESS_WINDOW_MS,
  CODE_ENTRY_RATE_LIMIT_MAX,
  CODE_ENTRY_RATE_LIMIT_WINDOW_MS,
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  MCP_ACCOUNT_RATE_LIMIT_MAX,
  MCP_ACCOUNT_RATE_LIMIT_WINDOW_MS,
  MCP_RATE_LIMIT_MAX,
  MCP_RATE_LIMIT_WINDOW_MS,
  REGISTER_RATE_LIMIT_MAX,
  REGISTER_RATE_LIMIT_WINDOW_MS,
  RESENDS_PER_HOUR_MAX,
  RESETS_PER_HOUR_MAX,
  SEND_CODE_RATE_LIMIT_MAX,
  SEND_CODE_RATE_LIMIT_WINDOW_MS,
  SEND_FUSE_WINDOW_MS,
  SEND_PER_ADDRESS_MAX,
  SEND_PER_ADDRESS_MAX_KEYS,
  SEND_PER_ADDRESS_WINDOW_MS,
  WIDER_NETWORK_BUDGET_MULTIPLIER,
} from "../config/limits.js";
import type { AccountRateLimits } from "./accountHandlers.js";
import { createTieredLimiter } from "./tieredLimiter.js";

/** A per-IP limiter in two tiers (spec §3.5): `max` per key, and a wider
 * budget of `max × WIDER_NETWORK_BUDGET_MULTIPLIER` per IPv6 /48. */
function createTieredIpLimiter(max: number, windowMs: number): RateLimiter {
  return createTieredLimiter(
    createRateLimiter(max, windowMs),
    createRateLimiter(max * WIDER_NETWORK_BUDGET_MULTIPLIER, windowMs),
  );
}

/**
 * The per-IP limiters of the five account endpoints, each its own instance
 * from its own constants: a caller who spends `/register`'s budget has not
 * spent `/resend-code`'s, and the two send-code and the two code-entry
 * endpoints count separately.
 */
export function createAccountLimits(): AccountRateLimits {
  return {
    register: createTieredIpLimiter(
      REGISTER_RATE_LIMIT_MAX,
      REGISTER_RATE_LIMIT_WINDOW_MS,
    ),
    resendCode: createTieredIpLimiter(
      SEND_CODE_RATE_LIMIT_MAX,
      SEND_CODE_RATE_LIMIT_WINDOW_MS,
    ),
    confirmEmail: createTieredIpLimiter(
      CODE_ENTRY_RATE_LIMIT_MAX,
      CODE_ENTRY_RATE_LIMIT_WINDOW_MS,
    ),
    requestReset: createTieredIpLimiter(
      SEND_CODE_RATE_LIMIT_MAX,
      SEND_CODE_RATE_LIMIT_WINDOW_MS,
    ),
    resetPassword: createTieredIpLimiter(
      CODE_ENTRY_RATE_LIMIT_MAX,
      CODE_ENTRY_RATE_LIMIT_WINDOW_MS,
    ),
  };
}

/** The per-IP budget of `/login` (spec §3.5), two-tier like the account
 * endpoints. */
/** `/mcp`'s per-IP budget (tiered like the account routes). */
export function createMcpIpLimiter(): RateLimiter {
  return createTieredIpLimiter(MCP_RATE_LIMIT_MAX, MCP_RATE_LIMIT_WINDOW_MS);
}

/** `/mcp`'s per-account budget, keyed by account id. */
export function createMcpAccountLimiter(): RateLimiter {
  return createRateLimiter(
    MCP_ACCOUNT_RATE_LIMIT_MAX,
    MCP_ACCOUNT_RATE_LIMIT_WINDOW_MS,
  );
}

export function createLoginLimiter(): RateLimiter {
  return createTieredIpLimiter(
    LOGIN_RATE_LIMIT_MAX,
    LOGIN_RATE_LIMIT_WINDOW_MS,
  );
}

/** The per-ADDRESS code-entry budget, shared by confirmation and reset by
 * design (the account service holds the one instance). */
export function createCodeEntryLimiter(): RateLimiter {
  return createRateLimiter(
    CODE_ENTRY_PER_ADDRESS_MAX,
    CODE_ENTRY_PER_ADDRESS_WINDOW_MS,
    { maxKeys: CODE_ENTRY_PER_ADDRESS_MAX_KEYS },
  );
}

/** The per-ADDRESS send budget, shared by the three paths that send an
 * email (the account service holds the one instance). */
export function createSendLimiter(): RateLimiter {
  return createRateLimiter(SEND_PER_ADDRESS_MAX, SEND_PER_ADDRESS_WINDOW_MS, {
    maxKeys: SEND_PER_ADDRESS_MAX_KEYS,
  });
}

/** The three server-wide hourly fuses (spec §3.2), one key each. Sized with
 * `RESENDS_PER_HOUR_MAX` and `RESETS_PER_HOUR_MAX` so the three sum under
 * the project's email limit. */
export function createSendFuses(signupsPerHour: number): SendFuses {
  return {
    signUp: createRateLimiter(signupsPerHour, SEND_FUSE_WINDOW_MS),
    resend: createRateLimiter(RESENDS_PER_HOUR_MAX, SEND_FUSE_WINDOW_MS),
    reset: createRateLimiter(RESETS_PER_HOUR_MAX, SEND_FUSE_WINDOW_MS),
  };
}
