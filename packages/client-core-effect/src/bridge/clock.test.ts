import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("bridge/clock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Effect.sleep advances under vitest fake timers", async () => {
    vi.useFakeTimers();
    let fired = false;
    Effect.runFork(
      Effect.sleep("100 millis").pipe(
        Effect.andThen(
          Effect.sync(() => {
            fired = true;
          }),
        ),
      ),
    );
    await vi.advanceTimersByTimeAsync(99);
    expect(fired).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(fired).toBe(true);
  });
});
