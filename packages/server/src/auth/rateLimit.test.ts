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
});
