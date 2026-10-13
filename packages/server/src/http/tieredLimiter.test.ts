import { describe, expect, it } from "vitest";

import { createRateLimiter } from "#/auth/rateLimit";
import { createTieredLimiter } from "#/http/tieredLimiter";

describe("createTieredLimiter", () => {
  it("lets five /64s of one /48 spend the own budget each, then the /48 refuses the fifth", () => {
    const limiter = createTieredLimiter(
      createRateLimiter(1, 60_000),
      createRateLimiter(4, 60_000),
    );

    expect(limiter.hit("2001:db8:1:1::", 0)).toBe(true);
    expect(limiter.hit("2001:db8:1:2::", 0)).toBe(true);
    expect(limiter.hit("2001:db8:1:3::", 0)).toBe(true);
    expect(limiter.hit("2001:db8:1:4::", 0)).toBe(true);
    // A fifth /64 of the same /48: its own window is fresh, the /48's is spent.
    expect(limiter.hit("2001:db8:1:5::", 0)).toBe(false);
    // Another /48 is untouched.
    expect(limiter.hit("2001:db8:2:1::", 0)).toBe(true);
  });

  it("charges only the own window for an IPv4 caller", () => {
    const wider = createRateLimiter(1, 60_000);
    const limiter = createTieredLimiter(createRateLimiter(2, 60_000), wider);

    expect(limiter.hit("203.0.113.9", 0)).toBe(true);
    expect(limiter.hit("203.0.113.9", 0)).toBe(true);
    expect(limiter.hit("203.0.113.9", 0)).toBe(false);
    expect(wider.size()).toBe(0);
  });

  it("peek consults both windows and charges neither", () => {
    const limiter = createTieredLimiter(
      createRateLimiter(1, 60_000),
      createRateLimiter(1, 60_000),
    );

    expect(limiter.hit("2001:db8:1:1::", 0)).toBe(true);
    expect(limiter.peek("2001:db8:1:2::", 0)).toBe(false);
    expect(limiter.peek("2001:db8:2:1::", 0)).toBe(true);
    expect(limiter.size()).toBe(1);
  });
});
