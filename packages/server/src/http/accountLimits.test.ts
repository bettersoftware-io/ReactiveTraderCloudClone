import { describe, expect, it } from "vitest";

import type { RateLimiter } from "#/auth/rateLimit";
import {
  CODE_ENTRY_PER_ADDRESS_MAX,
  CODE_ENTRY_PER_ADDRESS_WINDOW_MS,
  CODE_ENTRY_RATE_LIMIT_MAX,
  CODE_ENTRY_RATE_LIMIT_WINDOW_MS,
  REGISTER_RATE_LIMIT_MAX,
  REGISTER_RATE_LIMIT_WINDOW_MS,
  SEND_CODE_RATE_LIMIT_MAX,
  SEND_CODE_RATE_LIMIT_WINDOW_MS,
} from "#/config/limits";
import {
  createAccountLimits,
  createCodeEntryLimiter,
} from "#/http/accountLimits";

describe("createAccountLimits", () => {
  it("gives every endpoint its own limiter instance", () => {
    const limits = createAccountLimits();
    const instances = Object.values(limits);

    expect(instances).toHaveLength(5);
    expect(new Set(instances).size).toBe(5);
  });

  it("does not let one endpoint spend another's budget", () => {
    const limits = createAccountLimits();

    exhaust(limits.register, REGISTER_RATE_LIMIT_MAX);
    exhaust(limits.resendCode, SEND_CODE_RATE_LIMIT_MAX);
    exhaust(limits.confirmEmail, CODE_ENTRY_RATE_LIMIT_MAX);

    expect(limits.requestReset.hit("1.2.3.4", 0)).toBe(true);
    expect(limits.resetPassword.hit("1.2.3.4", 0)).toBe(true);
  });

  it.each([
    ["register", REGISTER_RATE_LIMIT_MAX, REGISTER_RATE_LIMIT_WINDOW_MS],
    ["resendCode", SEND_CODE_RATE_LIMIT_MAX, SEND_CODE_RATE_LIMIT_WINDOW_MS],
    ["requestReset", SEND_CODE_RATE_LIMIT_MAX, SEND_CODE_RATE_LIMIT_WINDOW_MS],
    [
      "confirmEmail",
      CODE_ENTRY_RATE_LIMIT_MAX,
      CODE_ENTRY_RATE_LIMIT_WINDOW_MS,
    ],
    [
      "resetPassword",
      CODE_ENTRY_RATE_LIMIT_MAX,
      CODE_ENTRY_RATE_LIMIT_WINDOW_MS,
    ],
  ] as const)(
    "%s allows exactly %i hits per window of %i ms",
    (member, max, windowMs) => {
      expectBudget(createAccountLimits()[member], max, windowMs);
    },
  );
});

describe("createCodeEntryLimiter", () => {
  it("allows exactly CODE_ENTRY_PER_ADDRESS_MAX tries per address per window", () => {
    expectBudget(
      createCodeEntryLimiter(),
      CODE_ENTRY_PER_ADDRESS_MAX,
      CODE_ENTRY_PER_ADDRESS_WINDOW_MS,
    );
  });

  it("is a fresh instance per call", () => {
    expect(createCodeEntryLimiter()).not.toBe(createCodeEntryLimiter());
  });
});

function exhaust(limiter: RateLimiter, max: number): void {
  for (let hit = 0; hit < max; hit += 1) {
    limiter.hit("1.2.3.4", 0);
  }
}

/** `max` hits pass inside the window, the next is refused, the last
 * millisecond of the window still refuses, and the window's end resets it. */
function expectBudget(
  limiter: RateLimiter,
  max: number,
  windowMs: number,
): void {
  for (let hit = 0; hit < max; hit += 1) {
    expect(limiter.hit("key", hit)).toBe(true);
  }

  expect(limiter.hit("key", max)).toBe(false);
  expect(limiter.hit("key", windowMs - 1)).toBe(false);
  expect(limiter.hit("key", windowMs)).toBe(true);
}
