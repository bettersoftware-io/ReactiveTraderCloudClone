import { describe, expect, it } from "vitest";

import { createRateLimiter } from "#/auth/rateLimit";

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
});
