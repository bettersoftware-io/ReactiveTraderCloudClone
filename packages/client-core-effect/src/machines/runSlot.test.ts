import { Duration, Effect, Scope, SubscriptionRef } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDetachedHost, type EffectHost } from "#/bridge/out";
import { createRunSlot, type Run, type RunSlot } from "#/machines/runSlot";

describe("createRunSlot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const slot of activeSlots) {
      slot.dispose();
    }

    activeSlots.length = 0;
    vi.useRealTimers();
  });

  it("start() forks the build and write() updates the ref", async () => {
    const { host, ref, slot } = createHarness();

    slot.start((run: Run<number>) => {
      return run.write(() => {
        return 1;
      });
    });
    await settle();

    expect(current(host, ref)).toBe(1);
  });

  it("a second start() interrupts the first run's fiber; its queued write and guarded step never land", async () => {
    const { host, ref, slot } = createHarness();
    let finalized = false;
    let guardedRan = false;

    slot.start((run: Run<number>) => {
      return Effect.gen(function* runFirst() {
        yield* run.write(() => {
          return 1;
        });
        yield* Effect.sleep(Duration.millis(10));
        yield* run.write(() => {
          return 2;
        });
        yield* run.guarded(
          Effect.sync(() => {
            guardedRan = true;
          }),
        );
      }).pipe(
        Effect.onInterrupt(() => {
          return Effect.sync(() => {
            finalized = true;
          });
        }),
      );
    });
    await settle();
    expect(current(host, ref)).toBe(1);

    // Fire the sleep timer SYNCHRONOUSLY: the continuation (the second
    // write, then the guarded step) is queued on the scheduler but has not
    // run yet — the window `advanceTimersByTimeAsync` would close by
    // flushing it first. The second start() lands in that window
    // (`rfqSubmission.test.ts` drives the same window). This pins the
    // OUTCOME — the finalizer runs and the queued write/guarded never land
    // — not which mechanism stops them; the directly-driven cases below
    // isolate the token guard on its own, with no fiber or interrupt in
    // play at all.
    vi.advanceTimersByTime(10);
    slot.start((run: Run<number>) => {
      return run.write(() => {
        return 100;
      });
    });
    await settle();

    expect(finalized).toBe(true);
    expect(current(host, ref)).toBe(100);
    expect(guardedRan).toBe(false);
  });

  it("a build that calls start() on its OWN slot interrupts itself first; the second run executes and the first run's write yielded after the inner start never reaches the ref", async () => {
    const { host, ref, slot } = createHarness();

    slot.start((run: Run<number>) => {
      return Effect.gen(function* runFirst() {
        slot.start((run2: Run<number>) => {
          return run2.write(() => {
            return 2;
          });
        });
        yield* run.write(() => {
          return 1;
        });
      });
    });
    await settle();

    expect(current(host, ref)).toBe(2);
  });

  it("start() reassigning the token stops a captured run's write()/guarded() driven DIRECTLY — no fiber, no interrupt in play (positive control: the still-live run's write/guarded do land)", () => {
    const { host, ref, slot } = createHarness();
    const captured = captureRun(slot);
    let guardedRan = false;

    // Positive control: the run is still the live one, so driving its
    // write/guarded directly — bypassing the fiber and any interrupt
    // entirely — reaches the ref and runs the step.
    host.runtime.runSync(
      captured.write(() => {
        return 7;
      }),
    );
    expect(current(host, ref)).toBe(7);
    host.runtime.runSync(
      captured.guarded(
        Effect.sync(() => {
          guardedRan = true;
        }),
      ),
    );
    expect(guardedRan).toBe(true);

    // Supersede it: a fresh start() reassigns the token. No interrupt has
    // had a chance to run anything below — this call returns synchronously.
    slot.start(() => {
      return Effect.never;
    });

    // Driven the SAME way, with no fiber and no interrupt in play at all:
    // only the token comparison inside `guarded` can be what stops these.
    guardedRan = false;
    host.runtime.runSync(
      captured.write(() => {
        return 999;
      }),
    );
    expect(current(host, ref)).toBe(7);
    host.runtime.runSync(
      captured.guarded(
        Effect.sync(() => {
          guardedRan = true;
        }),
      ),
    );
    expect(guardedRan).toBe(false);
  });

  it("end() invalidates a captured run's token too: write()/guarded() driven DIRECTLY no longer land", () => {
    const { host, ref, slot } = createHarness();
    const captured = captureRun(slot);
    let guardedRan = false;

    // Same positive control as the start()-supersede case above, pinned
    // once more so this test stands on its own.
    host.runtime.runSync(
      captured.write(() => {
        return 3;
      }),
    );
    expect(current(host, ref)).toBe(3);

    slot.end();

    host.runtime.runSync(
      captured.write(() => {
        return 404;
      }),
    );
    expect(current(host, ref)).toBe(3);
    host.runtime.runSync(
      captured.guarded(
        Effect.sync(() => {
          guardedRan = true;
        }),
      ),
    );
    expect(guardedRan).toBe(false);
  });

  it("end() with nothing live is a harmless no-op; a following start() still runs", async () => {
    const { host, ref, slot } = createHarness();

    expect(() => {
      slot.end();
    }).not.toThrow();

    slot.start((run: Run<number>) => {
      return run.write(() => {
        return 5;
      });
    });
    await settle();

    expect(current(host, ref)).toBe(5);
  });

  it("dispose() interrupts the run in flight, closes the host's scope, refuses a later start(), and is idempotent", async () => {
    const { host, ref, slot } = createHarness();
    let runFinalized = false;
    let scopeFinalized = false;
    host.runtime.runSync(
      Scope.addFinalizer(
        host.scope,
        Effect.sync(() => {
          scopeFinalized = true;
        }),
      ),
    );

    slot.start((run: Run<number>) => {
      return run
        .write(() => {
          return 1;
        })
        .pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => {
            return Effect.sync(() => {
              runFinalized = true;
            });
          }),
        );
    });
    await settle();
    expect(current(host, ref)).toBe(1);
    expect(slot.isDisposed()).toBe(false);

    slot.dispose();
    await settle();
    expect(runFinalized).toBe(true);
    expect(scopeFinalized).toBe(true);
    expect(slot.isDisposed()).toBe(true);

    slot.start((run: Run<number>) => {
      return run.write(() => {
        return 999;
      });
    });
    await settle();
    expect(current(host, ref)).toBe(1);

    expect(() => {
      slot.dispose();
    }).not.toThrow();
    expect(slot.isDisposed()).toBe(true);
  });

  it("a failing build is rethrown out of band", async () => {
    const { slot } = createHarness();

    slot.start(() => {
      return Effect.fail(new Error("build failed"));
    });
    await expect(vi.advanceTimersByTimeAsync(0)).rejects.toThrow(
      "build failed",
    );
  });

  it("a run ended from OUTSIDE (end()) does not rethrow — its fiber's teardown does not crash the slot", async () => {
    const { host, ref, slot } = createHarness();

    slot.start(() => {
      return Effect.never;
    });
    await settle();
    slot.end();

    // No assertion beyond the advance surviving: a rethrow would reject
    // this and fail the test, the same witness `bridge/out.test.ts` uses
    // for the failing-build case above. This is a behavioural guarantee on
    // its own — ending a run must never crash — but it does NOT, by
    // itself, prove the `Cause.isInterruptedOnly` filter's skip branch ran:
    // the next case isolates that with a self-interrupting build.
    await vi.advanceTimersByTimeAsync(0);
    expect(current(host, ref)).toBe(0);
  });

  it("a build that interrupts ITSELF is silent too, and this is the case that actually proves the filter's skip branch runs", () => {
    const { host, ref, slot } = createHarness();

    // `Effect.interrupt` self-interrupts from INSIDE the build's own
    // fiber, so — unlike ending the run from outside above — it is
    // guaranteed to unwind through this run's own `catchAllCause`, not
    // just abandon the fiber before reaching it.
    slot.start(() => {
      return Effect.interrupt;
    });

    expect(() => {
      vi.runAllTimers();
    }).not.toThrow();
    expect(current(host, ref)).toBe(0);
  });
});

interface RunSlotHarness {
  host: EffectHost;
  ref: SubscriptionRef.SubscriptionRef<number>;
  slot: RunSlot<number>;
}

const activeSlots: RunSlot<number>[] = [];

/** A fresh detached host + a number-valued ref + the slot under test,
 * tracked for `afterEach` teardown so a failing assertion mid-test cannot
 * leak the host's fiber or scope. */
function createHarness(): RunSlotHarness {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(SubscriptionRef.make(0));
  const slot = createRunSlot(host, ref);
  activeSlots.push(slot);
  return { host, ref, slot };
}

/** `start()` a run that never completes and hand back the `Run` it was
 * built with — captured SYNCHRONOUSLY, since `start()` calls its `build`
 * callback before forking. Lets a test drive `write`/`guarded` directly
 * via `host.runtime.runSync`, with no fiber and no interrupt anywhere in
 * the picture, so only the token comparison inside `guarded` can explain
 * the result. */
function captureRun(slot: RunSlot<number>): Run<number> {
  let captured: Run<number> | null = null;

  slot.start((run: Run<number>) => {
    captured = run;
    return Effect.never;
  });

  if (captured === null) {
    throw new Error("start() did not call its build synchronously");
  }

  return captured;
}

function current<S>(
  host: EffectHost,
  ref: SubscriptionRef.SubscriptionRef<S>,
): S {
  return host.runtime.runSync(SubscriptionRef.get(ref));
}

/** Two zero-length advances: no time moves, the microtask continuations an
 * Effect fiber resumes on do. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}
