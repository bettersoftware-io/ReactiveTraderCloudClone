import { describe, expect, it } from "vitest";

import { createRateLimiter } from "#/auth/rateLimit";

describe("refund", () => {
  it("gives back one hit of the current window", () => {
    const limiter = createRateLimiter(2, 1_000);

    limiter.hit("a", 0);
    limiter.hit("a", 0);
    limiter.refund("a");

    expect(limiter.hit("a", 20)).toBe(true);
    expect(limiter.hit("a", 20)).toBe(false);
  });

  it("does nothing for a key with no window", () => {
    const limiter = createRateLimiter(1, 1_000);

    limiter.refund("a");

    expect(limiter.size()).toBe(0);
  });

  it("never gives back more than was charged", () => {
    const limiter = createRateLimiter(1, 1_000);

    limiter.hit("a", 0);
    limiter.refund("a");
    limiter.refund("a");
    limiter.hit("a", 3);

    expect(limiter.hit("a", 4)).toBe(false);
  });
});

describe("rateLimit", () => {
  it("allows up to max then throttles within the window", () => {
    const rl = createRateLimiter(3, 1000);
    expect(rl.hit("ip", 0)).toBe(true);
    expect(rl.hit("ip", 100)).toBe(true);
    expect(rl.hit("ip", 200)).toBe(true);
    expect(rl.hit("ip", 300)).toBe(false); // 4th within window
  });
  it("resets after the window", () => {
    const rl = createRateLimiter(1, 1000);
    expect(rl.hit("ip", 0)).toBe(true);
    expect(rl.hit("ip", 500)).toBe(false);
    expect(rl.hit("ip", 1500)).toBe(true); // new window
  });
  it("keys independently", () => {
    const rl = createRateLimiter(1, 1000);
    expect(rl.hit("a", 0)).toBe(true);
    expect(rl.hit("b", 0)).toBe(true);
  });

  it("evicts expired windows so the table does not grow without bound (S4)", () => {
    const rl = createRateLimiter(1, 1_000, { maxKeys: 4 });

    for (let i = 0; i < 4; i += 1) {
      rl.hit(`ip-${i}`, 0);
    }

    expect(rl.size()).toBe(4);
    rl.hit("ip-new", 5_000);
    expect(rl.size()).toBe(1);
  });

  it("never exceeds maxKeys even when nothing has expired: the oldest window goes", () => {
    const rl = createRateLimiter(1, 1_000, { maxKeys: 2 });
    rl.hit("a", 0);
    rl.hit("b", 100);
    rl.hit("c", 200);

    expect(rl.size()).toBe(2);
    expect(rl.hit("a", 300)).toBe(true);
  });

  it("holds up to maxKeys distinct keys without evicting a live window", () => {
    const rl = createRateLimiter(1, 1_000, { maxKeys: 2 });
    rl.hit("a", 0);
    rl.hit("b", 100);

    expect(rl.size()).toBe(2);
    expect(rl.hit("a", 200)).toBe(false);
    expect(rl.hit("b", 200)).toBe(false);
  });

  it("peek reports whether a hit would be allowed, and charges nothing", () => {
    const rl = createRateLimiter(2, 1_000);

    expect(rl.peek("ip", 0)).toBe(true);
    expect(rl.hit("ip", 0)).toBe(true);
    expect(rl.hit("ip", 10)).toBe(true);
    expect(rl.peek("ip", 20)).toBe(false);
    // A refused peek did not open a window; a new window after it passes.
    expect(rl.peek("ip", 1_500)).toBe(true);
    expect(rl.hit("ip", 1_500)).toBe(true);
  });

  it("peek on a key never seen does not add it to the table", () => {
    const rl = createRateLimiter(1, 1_000);

    expect(rl.peek("fresh", 0)).toBe(true);
    expect(rl.size()).toBe(0);
  });
});
