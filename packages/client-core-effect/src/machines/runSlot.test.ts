import { Duration, Effect, Scope, SubscriptionRef } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDetachedHost, type EffectHost } from "#/bridge/out";
import { createRunSlot, type Run } from "#/machines/runSlot";

describe("createRunSlot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("start() forks the build and write() updates the ref", async () => {
    const host = createDetachedHost();
    const ref = host.runtime.runSync(SubscriptionRef.make(0));
    const slot = createRunSlot(host, ref);

    slot.start((run: Run<number>) => {
      return run.write(() => {
        return 1;
      });
    });
    await settle();

    expect(current(host, ref)).toBe(1);
    slot.dispose();
  });

  it("a second start() interrupts the first fiber's finalizer, and the token guard — not just the interrupt — skips its queued write/guarded", async () => {
    const host = createDetachedHost();
    const ref = host.runtime.runSync(SubscriptionRef.make(0));
    const slot = createRunSlot(host, ref);
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
    // flushing it first. The second start() lands in that window, so what
    // stops the stale write is the token guard, not the interrupt alone
    // (`rfqSubmission.test.ts` drives the same window).
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

    slot.dispose();
  });

  it("end() interrupts the run in flight; its later write is skipped", async () => {
    const host = createDetachedHost();
    const ref = host.runtime.runSync(SubscriptionRef.make(0));
    const slot = createRunSlot(host, ref);
    let finalized = false;

    slot.start((run: Run<number>) => {
      return run
        .write(() => {
          return 1;
        })
        .pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => {
            return Effect.sync(() => {
              finalized = true;
            });
          }),
        );
    });
    await settle();
    expect(current(host, ref)).toBe(1);

    slot.end();
    await settle();
    expect(finalized).toBe(true);
    expect(current(host, ref)).toBe(1);

    slot.dispose();
  });

  it("dispose() interrupts the run in flight, closes the host's scope, refuses a later start(), and is idempotent", async () => {
    const host = createDetachedHost();
    const ref = host.runtime.runSync(SubscriptionRef.make(0));
    const slot = createRunSlot(host, ref);
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
    const host = createDetachedHost();
    const ref = host.runtime.runSync(SubscriptionRef.make(0));
    const slot = createRunSlot(host, ref);

    slot.start(() => {
      return Effect.fail(new Error("build failed"));
    });
    await expect(vi.advanceTimersByTimeAsync(0)).rejects.toThrow(
      "build failed",
    );

    slot.dispose();
  });

  it("an interrupted build is silent — no out-of-band rethrow", async () => {
    const host = createDetachedHost();
    const ref = host.runtime.runSync(SubscriptionRef.make(0));
    const slot = createRunSlot(host, ref);

    slot.start(() => {
      return Effect.never;
    });
    await settle();
    slot.end();

    // No assertion beyond the await surviving: a rethrow would reject this
    // and fail the test, the same witness `bridge/out.test.ts` uses for the
    // failing-build case above.
    await vi.advanceTimersByTimeAsync(0);
    expect(current(host, ref)).toBe(0);

    slot.dispose();
  });
});

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
