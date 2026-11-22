import { Context, Effect, Exit } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { interruptFiber, runnerFor } from "#/bridge/out";
import { callbackOnTurn, turnClock } from "#/bridge/turnResume";

describe("bridge/turnResume", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a fiber a timer wakes takes its next step on the turn, not inside the timer — an interrupt in the same block wins", async () => {
    vi.useFakeTimers();
    const runner = runnerFor(Context.empty());
    let fired = false;
    const fiber = runner.runFork(
      Effect.sleep(100).pipe(
        Effect.andThen(
          Effect.sync(() => {
            fired = true;
          }),
        ),
      ),
    );
    vi.advanceTimersByTime(100);
    expect(fired).toBe(false);
    interruptFiber(fiber);
    await vi.advanceTimersByTimeAsync(0);
    expect(fired).toBe(false);
  });

  it("left alone, the woken fiber's step lands on the next microtask", async () => {
    vi.useFakeTimers();
    const runner = runnerFor(Context.empty());
    let fired = false;
    runner.runFork(
      Effect.sleep(100).pipe(
        Effect.andThen(
          Effect.sync(() => {
            fired = true;
          }),
        ),
      ),
    );
    vi.advanceTimersByTime(100);
    expect(fired).toBe(false);
    await Promise.resolve();
    expect(fired).toBe(true);
  });

  it("callbackOnTurn() takes even a resume made during register on the turn — the fiber suspends first, as on effect 3", async () => {
    const runner = runnerFor(Context.empty());
    const answered = callbackOnTurn<number>((resume) => {
      resume(Effect.succeed(3));
    });
    const fiber = runner.runFork(answered);
    expect(fiber.pollUnsafe()).toBeUndefined();
    await Promise.resolve();
    expect(fiber.pollUnsafe()).toEqual(Exit.succeed(3));
    // A host's runSync still answers: it settles the turn before reading.
    expect(runner.runSync(answered)).toBe(3);
  });

  it("the turn clock reads time from the default clock, yields for a zero sleep and never wakes from an endless one", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    expect(turnClock.currentTimeMillisUnsafe()).toBe(1_000);
    expect(typeof turnClock.currentTimeNanosUnsafe()).toBe("bigint");
    expect(typeof turnClock.monotonicTimeNanosUnsafe()).toBe("bigint");

    const runner = runnerFor(Context.empty());
    const zero = runner.runFork(Effect.sleep(0));
    expect(zero.pollUnsafe()).toBeUndefined();
    await Promise.resolve();
    expect(zero.pollUnsafe()).toBeDefined();

    const endless = runner.runFork(Effect.sleep(Number.POSITIVE_INFINITY));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(endless.pollUnsafe()).toBeUndefined();
    interruptFiber(endless);
  });

  it("a sleep longer than one timer can hold is a chain of timers", async () => {
    vi.useFakeTimers();
    const runner = runnerFor(Context.empty());
    const longest = 2 ** 31 - 1;
    const fiber = runner.runFork(Effect.sleep(longest + 5));
    await vi.advanceTimersByTimeAsync(longest);
    expect(fiber.pollUnsafe()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5);
    expect(fiber.pollUnsafe()).toBeDefined();
  });
});
