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

  it("settle() runs a zero-delay continuation and the microtasks it queues, without moving time", async () => {
    await withFakeClock(async (clock) => {
      const order: string[] = [];
      const before = Date.now();
      setTimeout(() => {
        order.push("macrotask");
        void Promise.resolve().then(() => {
          order.push("microtask");
        });
      }, 0);
      await clock.settle();
      expect(order).toEqual(["macrotask", "microtask"]);
      expect(Date.now()).toBe(before);
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
