import { describe, expect, it, vi } from "vitest";

import { withFakeClock } from "#/harness/clock";

describe("withFakeClock", () => {
  it("advances timers deterministically and restores real timers afterwards", async () => {
    let fired = false;
    await withFakeClock(async (clock) => {
      setTimeout(() => {
        fired = true;
      }, 1_000);
      await clock.advance(999);
      expect(fired).toBe(false);
      await clock.advance(1);
      expect(fired).toBe(true);
    });
    expect(vi.isFakeTimers()).toBe(false);
  });

  it("settle() runs continuations scheduled at zero delay, twice over", async () => {
    await withFakeClock(async (clock) => {
      const order: string[] = [];
      setTimeout(() => {
        order.push("first");
        setTimeout(() => {
          order.push("second");
        }, 0);
      }, 0);
      await clock.settle();
      expect(order).toEqual(["first", "second"]);
    });
  });

  it("restores real timers when the body throws", async () => {
    await expect(
      withFakeClock(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(vi.isFakeTimers()).toBe(false);
  });
});
