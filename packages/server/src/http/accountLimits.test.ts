import { describe, expect, it } from "vitest";

import type { RateLimiter } from "#/auth/rateLimit";
import {
  CODE_ENTRY_PER_ADDRESS_MAX,
  CODE_ENTRY_PER_ADDRESS_WINDOW_MS,
  CODE_ENTRY_RATE_LIMIT_MAX,
  CODE_ENTRY_RATE_LIMIT_WINDOW_MS,
  REGISTER_RATE_LIMIT_MAX,
  REGISTER_RATE_LIMIT_WINDOW_MS,
  RESENDS_PER_HOUR_MAX,
  RESETS_PER_HOUR_MAX,
  SEND_CODE_RATE_LIMIT_MAX,
  SEND_CODE_RATE_LIMIT_WINDOW_MS,
  SEND_FUSE_WINDOW_MS,
} from "#/config/limits";
import {
  createAccountLimits,
  createCodeEntryLimiter,
  createSendFuses,
  createSendLimiter,
} from "#/http/accountLimits";

describe("createAccountLimits", () => {
  it("bounds a /48 at four /64s' worth of /register", () => {
    const { register } = createAccountLimits();
    const perKey = REGISTER_RATE_LIMIT_MAX;

    for (let network = 1; network <= 4; network += 1) {
      for (let i = 0; i < perKey; i += 1) {
        expect(register.hit(`2001:db8:1:${network}::`, 0)).toBe(true);
      }
    }

    expect(register.hit("2001:db8:1:5::", 0)).toBe(false);
    expect(register.hit("2001:db8:2:1::", 0)).toBe(true);
  });

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

  it("holds 50,000 addresses before evicting the oldest", () => {
    expectMaxKeys(createCodeEntryLimiter(), 5, 50_000);
  });

  it("is a fresh instance per call", () => {
    expect(createCodeEntryLimiter()).not.toBe(createCodeEntryLimiter());
  });
});

/** Each limit once as a literal, so changing a constant fails a test. */
describe("the account limits, pinned as numbers", () => {
  it.each([
    ["register", 5, 60 * 60 * 1_000],
    ["resendCode", 5, 60 * 60 * 1_000],
    ["requestReset", 5, 60 * 60 * 1_000],
    ["confirmEmail", 10, 10 * 60 * 1_000],
    ["resetPassword", 10, 10 * 60 * 1_000],
  ] as const)("%s per IP: %i per %i ms", (member, max, windowMs) => {
    expectBudget(createAccountLimits()[member], max, windowMs);
  });

  it("code entry per address: 5 per 15 minutes", () => {
    expectBudget(createCodeEntryLimiter(), 5, 15 * 60 * 1_000);
  });

  it("the per-IP limiters hold the default 10,000 keys", () => {
    expectMaxKeys(createAccountLimits().register, 5, 10_000);
  });
});

describe("createSendLimiter", () => {
  it("allows exactly 3 sends per address per hour", () => {
    expectBudget(createSendLimiter(), 3, 60 * 60 * 1_000);
  });

  it("holds 50,000 addresses before evicting the oldest", () => {
    expectMaxKeys(createSendLimiter(), 3, 50_000);
  });

  it("is a fresh instance per call", () => {
    expect(createSendLimiter()).not.toBe(createSendLimiter());
  });
});

describe("createSendFuses", () => {
  it("sizes the three fuses 25, 15 and 15 per hour when given 25", () => {
    const fuses = createSendFuses(25);

    expectBudget(fuses.signUp, 25, SEND_FUSE_WINDOW_MS);
    expectBudget(fuses.resend, RESENDS_PER_HOUR_MAX, SEND_FUSE_WINDOW_MS);
    expectBudget(fuses.reset, RESETS_PER_HOUR_MAX, SEND_FUSE_WINDOW_MS);
    expect([RESENDS_PER_HOUR_MAX, RESETS_PER_HOUR_MAX]).toEqual([15, 15]);
  });

  it("makes three independent instances, each fresh per call", () => {
    const fuses = createSendFuses(25);

    exhaust(fuses.signUp, 25);

    expect(fuses.resend.peek("1.2.3.4", 0)).toBe(true);
    expect(fuses.reset.peek("1.2.3.4", 0)).toBe(true);
    expect(createSendFuses(25).signUp).not.toBe(fuses.signUp);
  });
});

function exhaust(limiter: Pick<RateLimiter, "hit">, max: number): void {
  for (let hit = 0; hit < max; hit += 1) {
    limiter.hit("1.2.3.4", 0);
  }
}

/** `max` hits pass inside the window, the next is refused, the last
 * millisecond of the window still refuses, and the window's end resets it. */
function expectBudget(
  limiter: Pick<RateLimiter, "hit">,
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

/** A spent key stays refused while the table holds `maxKeys` keys, and is
 * evicted (so allowed again) by the key after that. */
function expectMaxKeys(
  limiter: RateLimiter,
  max: number,
  maxKeys: number,
): void {
  for (let hit = 0; hit < max; hit += 1) {
    limiter.hit("first", 0);
  }

  for (let key = 1; key < maxKeys; key += 1) {
    limiter.hit(`key-${key}`, 1);
  }

  expect(limiter.size()).toBe(maxKeys);
  expect(limiter.hit("first", 2)).toBe(false);

  limiter.hit("one-more", 2);

  expect(limiter.hit("first", 2)).toBe(true);
}
