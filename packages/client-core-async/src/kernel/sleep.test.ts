import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AbortError } from "#/kernel/AbortError";
import { sleep } from "#/kernel/sleep";

describe("sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the delay", async () => {
    const p = sleep(100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBeUndefined();
  });

  it("rejects with AbortError when the signal aborts first, and clears the timer", async () => {
    const controller = new AbortController();
    const p = sleep(100, controller.signal);
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects immediately on an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(100, controller.signal)).rejects.toBeInstanceOf(
      AbortError,
    );
  });
});
