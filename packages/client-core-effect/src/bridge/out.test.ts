import {
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import { Subject, type Subscription } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import { reconnect$ } from "@rtc/client-core";

import { fromObservable } from "#/bridge/in";
import {
  type EffectHost,
  type FoldUpdate,
  pushReconnectIntent,
  refToStateStream,
  sharedFold,
  streamToStream,
} from "#/bridge/out";

describe("bridge/out", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await closeHost(host);
      }
    }
  });

  it("streamToStream() forwards emissions and completes", async () => {
    const seen: number[] = [];
    await new Promise<void>((resolve) => {
      streamToStream(useHost(), Stream.make(1, 2, 3)).subscribe({
        next: (v: number) => {
          seen.push(v);
        },
        complete: resolve,
      });
    });
    expect(seen).toEqual([1, 2, 3]);
  });

  it("streamToStream() interrupts the fiber on unsubscribe", async () => {
    const { stream, wasInterrupted } = createNeverStream();
    const sub = streamToStream(useHost(), stream).subscribe(() => {});
    // Let the fiber actually start: `runFork` returns before the stream is
    // running, and an interrupt delivered before `Effect.never` is reached
    // unwinds a fiber that has not yet registered `onInterrupt`.
    await tick();
    sub.unsubscribe();
    await tick();
    expect(wasInterrupted()).toBe(true);
  });

  it("streamToStream() surfaces a stream failure as an Observable error", async () => {
    const boom = new Error("boom");
    const failure = await new Promise<unknown>((resolve) => {
      streamToStream(useHost(), Stream.fail(boom)).subscribe({
        error: resolve,
      });
    });
    expect(failure).toBe(boom);
  });

  it("streamToStream() keeps an interrupt-only cause silent", async () => {
    let errored = false;
    let completed = false;
    streamToStream(useHost(), Stream.fromEffect(Effect.interrupt)).subscribe({
      error: () => {
        errored = true;
      },
      complete: () => {
        completed = true;
      },
    });
    await tick();
    expect(errored).toBe(false);
    expect(completed).toBe(false);
  });

  it("streamToStream() fibers are interrupted when the host scope closes", async () => {
    const host = createHost();
    const { stream, wasInterrupted } = createNeverStream();
    streamToStream(host, stream).subscribe(() => {});
    await tick();
    expect(wasInterrupted()).toBe(false);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(wasInterrupted()).toBe(true);
    await host.runtime.dispose();
  });

  it("streamToStream() unsubscribe still interrupts after the runtime is disposed", async () => {
    const host = createHost();
    const { stream, wasInterrupted } = createNeverStream();
    const rejections: unknown[] = [];

    function recordRejection(reason: unknown): void {
      rejections.push(reason);
    }

    process.on("unhandledRejection", recordRejection);

    try {
      const sub = streamToStream(host, stream).subscribe(() => {});
      await tick();
      // Dispose the runtime but NOT the scope, so the fiber is still live:
      // `dispose()` swaps the managed runtime's effect for a defect, so an
      // interrupt forked on IT would die instead of landing. The teardown
      // uses the global runtime precisely so this still works.
      await host.runtime.dispose();
      expect(wasInterrupted()).toBe(false);

      expect(() => {
        sub.unsubscribe();
      }).not.toThrow();
      await tick();
      expect(wasInterrupted()).toBe(true);
      await tick();
    } finally {
      process.off("unhandledRejection", recordRejection);
      await Effect.runPromise(Scope.close(host.scope, Exit.void));
    }

    expect(rejections).toEqual([]);
  });

  it("refToStateStream() carries the current value synchronously, then changes", async () => {
    const host = useHost();
    const ref = await host.runtime.runPromise(SubscriptionRef.make(5));
    const seen: number[] = [];
    const sub = refToStateStream(host, ref).subscribe((v: number) => {
      seen.push(v);
    });
    expect(seen).toEqual([5]);
    await host.runtime.runPromise(SubscriptionRef.set(ref, 6));
    await tick();
    expect(seen).toEqual([5, 6]);
    sub.unsubscribe();
  });

  it("refToStateStream() observes a set made while it is still cold", async () => {
    const host = useHost();
    const ref = await host.runtime.runPromise(SubscriptionRef.make(5));
    const stream = refToStateStream(host, ref);
    // Nobody has subscribed yet — the value must still be read per
    // subscription, not frozen at construction.
    await host.runtime.runPromise(SubscriptionRef.set(ref, 6));
    const seen: number[] = [];
    const sub = stream.subscribe((v: number) => {
      seen.push(v);
    });
    expect(seen).toEqual([6]);
    await tick();
    expect(seen).toEqual([6]);
    sub.unsubscribe();
  });

  it("refToStateStream() re-reads the ref on every cold → warm cycle", async () => {
    const host = useHost();
    const ref = await host.runtime.runPromise(SubscriptionRef.make(5));
    const stream = refToStateStream(host, ref);

    const first: number[] = [];
    const firstSub = stream.subscribe((v: number) => {
      first.push(v);
    });
    expect(first).toEqual([5]);
    firstSub.unsubscribe();

    await host.runtime.runPromise(SubscriptionRef.set(ref, 7));

    const second: number[] = [];
    const secondSub = stream.subscribe((v: number) => {
      second.push(v);
    });
    expect(second).toEqual([7]);
    await tick();
    expect(second).toEqual([7]);
    secondSub.unsubscribe();
  });

  it("sharedFold() hands the seed to the first subscriber synchronously", () => {
    const stream = sharedFold(useHost(), {
      seed: () => {
        return 1;
      },
      run: () => {
        return Effect.never;
      },
    });
    const seen: number[] = [];
    const sub = stream.subscribe((v: number) => {
      seen.push(v);
    });
    expect(seen).toEqual([1]);
    sub.unsubscribe();
  });

  it("sharedFold() folds an event emitted synchronously after the first subscribe", async () => {
    const subject = new Subject<number>();
    const stream = sharedFold(useHost(), {
      seed: () => {
        return 0;
      },
      run: (update: FoldUpdate<number>) => {
        return fromObservable(subject).pipe(
          Stream.runForEach((e: number) => {
            return update((s) => {
              return s + e;
            });
          }),
        );
      },
    });
    const seen: number[] = [];
    const sub = stream.subscribe((v: number) => {
      seen.push(v);
    });
    // No await between subscribe and this emission — the whole point: the
    // rxjs subscription (buried inside `fromObservable`, forked by
    // `startWarmPeriod` as part of THIS `subscribe()` call) must already be
    // live, or this event is lost (a `Subject` doesn't replay) exactly as it
    // was for the RxJS core's `commands.reconnect`/`setThemeMode` callers.
    subject.next(5);
    await tick();
    expect(seen).toEqual([0, 5]);
    sub.unsubscribe();
    await tick();
    expect(subject.observed).toBe(false);
  });

  it("sharedFold() delivers every state of a same-tick burst, in order", async () => {
    const subject = new Subject<number>();
    const stream = sharedFold(useHost(), {
      seed: () => {
        return 0;
      },
      run: (update: FoldUpdate<number>) => {
        return fromObservable(subject).pipe(
          Stream.runForEach((e: number) => {
            return update((s) => {
              return s + e;
            });
          }),
        );
      },
    });
    const seen: number[] = [];
    const sub = stream.subscribe((v: number) => {
      seen.push(v);
    });
    // Same tick, no await between any of these — every intermediate sum
    // must still arrive, not just the seed and the final total.
    subject.next(1);
    subject.next(2);
    subject.next(3);
    await tick();
    await tick();
    expect(seen).toEqual([0, 1, 3, 6]);
    sub.unsubscribe();
  });

  it("sharedFold() starts the producer on the first subscriber and interrupts it on the last", async () => {
    let interrupted = false;
    let starts = 0;
    const stream = sharedFold(useHost(), {
      seed: () => {
        return 0;
      },
      run: () => {
        starts += 1;
        return Effect.never.pipe(
          Effect.onInterrupt(() => {
            return Effect.sync(() => {
              interrupted = true;
            });
          }),
        );
      },
    });
    const a = stream.subscribe(() => {});
    const b = stream.subscribe(() => {});
    await tick();
    expect(starts).toBe(1);
    a.unsubscribe();
    await tick();
    expect(interrupted).toBe(false);
    b.unsubscribe();
    await tick();
    expect(interrupted).toBe(true);
  });

  it("sharedFold() delivers updates and de-duplicates Object.is-equal ones", async () => {
    const writes: FoldUpdate<number>[] = [];
    const host = useHost();
    const stream = sharedFold(host, {
      seed: () => {
        return 1;
      },
      run: (update: FoldUpdate<number>) => {
        writes.push(update);
        return Effect.never;
      },
    });
    const seen: number[] = [];
    const sub = stream.subscribe((v: number) => {
      seen.push(v);
    });
    await tick();
    expect(writes).toHaveLength(1);
    await host.runtime.runPromise(
      (writes[0] as FoldUpdate<number>)(() => {
        return 1;
      }),
    );
    await host.runtime.runPromise(
      (writes[0] as FoldUpdate<number>)((current) => {
        return current + 1;
      }),
    );
    await tick();
    expect(seen).toEqual([1, 2]);
    sub.unsubscribe();
  });

  it("sharedFold() re-seeds on every cold → warm cycle and ignores a stale producer's writes", async () => {
    const writes: FoldUpdate<number>[] = [];
    let seeds = 0;
    const host = useHost();
    const stream = sharedFold(host, {
      seed: () => {
        seeds += 1;
        return seeds * 10;
      },
      run: (update: FoldUpdate<number>) => {
        writes.push(update);
        return Effect.never;
      },
    });
    const first: number[] = [];
    const firstSub = stream.subscribe((v: number) => {
      first.push(v);
    });
    await tick();
    firstSub.unsubscribe();
    await tick();
    const second: number[] = [];
    const secondSub = stream.subscribe((v: number) => {
      second.push(v);
    });
    await tick();
    expect(first).toEqual([10]);
    expect(second).toEqual([20]);
    expect(writes).toHaveLength(2);
    // The FIRST warm period's producer writing after its period ended.
    await host.runtime.runPromise(
      (writes[0] as FoldUpdate<number>)(() => {
        return 99;
      }),
    );
    await host.runtime.runPromise(
      (writes[1] as FoldUpdate<number>)(() => {
        return 21;
      }),
    );
    await tick();
    expect(second).toEqual([20, 21]);
    secondSub.unsubscribe();
  });

  it("sharedFold() surfaces a producer failure as an Observable error", async () => {
    const boom = new Error("boom");
    const stream = sharedFold(useHost(), {
      seed: () => {
        return 0;
      },
      run: () => {
        return Effect.fail(boom);
      },
    });

    const failure = await new Promise<unknown>((resolve) => {
      stream.subscribe({
        error: resolve,
      });
    });
    expect(failure).toBe(boom);
  });

  it("sharedFold() swallows a producer's own self-interrupt without dispatching an error", async () => {
    // Unlike the scope-close test below — which interrupts the fiber
    // EXTERNALLY and never reaches `failEverySubscriber` at all (Effect
    // unwinds via finalizers only, bypassing `catchAllCause`) — a producer
    // that interrupts ITSELF (`Effect.interrupt`, mirroring
    // `streamToStream`'s own "keeps an interrupt-only cause silent" test)
    // has its cause flow through `catchAllCause` normally, exercising
    // `failEverySubscriber`'s `Cause.isInterruptedOnly` guard: the one
    // branch the rest of the suite doesn't reach.
    const stream = sharedFold(useHost(), {
      seed: () => {
        return 0;
      },
      run: () => {
        return Effect.interrupt;
      },
    });
    let errored = false;
    let completed = false;
    stream.subscribe({
      next: () => {},
      error: () => {
        errored = true;
      },
      complete: () => {
        completed = true;
      },
    });
    await tick();
    expect(errored).toBe(false);
    expect(completed).toBe(false);
  });

  it("sharedFold() stays on ONE warm period when a synchronous resubscribe races the first — a producer that fails at once, resubscribed from its own error()", async () => {
    // `.pipe(retry(1))` does NOT trigger this race — rxjs's own `retry`
    // guards a synchronous first-subscribe failure with a `syncUnsub` flag
    // and defers its resubscribe until AFTER the outer `subscribe()` call
    // has returned (measured against rxjs 7.8.2's `retry.js`), by which
    // point the (buggy) outer `warm = startWarmPeriod()` assignment has
    // already run. A raw resubscribe from inside a plain `error()` handler
    // has no such guard and runs the nested `subscribe()` truly synchronously
    // — still inside `startWarmPeriod()` for the failed period — which is
    // the actual race Important-1 fixes.
    const boom = new Error("boom");
    let seeds = 0;
    let attempts = 0;
    let thirdInterrupted = false;
    const host = useHost();
    const stream = sharedFold(host, {
      seed: () => {
        seeds += 1;
        return seeds;
      },
      // Fails at once on the FIRST attempt (the failure whose synchronous
      // fan-out drives the race below); a live producer on any later one.
      run: () => {
        attempts += 1;

        if (attempts === 1) {
          return Effect.fail(boom);
        }

        return Effect.never.pipe(
          Effect.onInterrupt(() => {
            return Effect.sync(() => {
              thirdInterrupted = true;
            });
          }),
        );
      },
    });

    let nested: Subscription | undefined;
    const nestedSeen: number[] = [];
    stream.subscribe({
      next: () => {},
      error: () => {
        // Synchronous, from inside the failing subscriber's own error() —
        // `sharedFold`'s Observable executor for the FIRST subscribe is
        // still on the call stack (still inside `startWarmPeriod`).
        nested = stream.subscribe((v: number) => {
          nestedSeen.push(v);
        });
      },
    });
    // Fixed behaviour: the nested resubscribe joins the SAME (already-
    // failed) period rather than racing a second one into existence — it
    // sees period 1's own seed, and the producer never runs a second time.
    // The bug this pins: without assigning `warm` before `runFork`, this
    // nested subscribe would still see `warm === null` and start ITS OWN
    // second period (`attempts` reaching 2, `nestedSeen` seeing seed `2`)
    // — which the OUTER subscribe's later `warm = startWarmPeriod()` then
    // silently orphans (see the trailing comment below).
    expect(nestedSeen).toEqual([1]);
    expect(attempts).toBe(1);
    nested?.unsubscribe();

    // With the race gone, the (single, now-empty) period's normal teardown
    // ran: `warm` is back to `null`. The deterministic, externally-
    // observable proof — rather than reading `warm` directly — is that a
    // completely fresh subscribe starts a genuinely NEW period (a fresh
    // `seed()` call) and that period's producer can be interrupted normally
    // on unsubscribe. Under the bug, the already-errored outer subscriber's
    // own teardown nulls `warm` out WHILE the live (nested) period was still
    // attached — orphaning it (never closed, its producer never
    // interrupted) — so this same sequence would instead start a THIRD,
    // redundant period on top of the leaked one.
    const third = stream.subscribe(() => {});
    expect(seeds).toBe(2);
    third.unsubscribe();
    await tick();
    expect(thirdInterrupted).toBe(true);
  });

  it("sharedFold() producers are interrupted when the host scope closes", async () => {
    const host = createHost();
    let interrupted = false;
    let errored = false;
    const stream = sharedFold(host, {
      seed: () => {
        return 0;
      },
      run: () => {
        return Effect.never.pipe(
          Effect.onInterrupt(() => {
            return Effect.sync(() => {
              interrupted = true;
            });
          }),
        );
      },
    });
    stream.subscribe({
      next: () => {},
      error: () => {
        errored = true;
      },
    });
    await tick();
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(interrupted).toBe(true);
    // Interruption is not a failure, from EITHER interruption path: an
    // externally-closed scope unwinds via finalizers only (never reaching
    // `failEverySubscriber`'s `catchAllCause` at all — the self-interrupt
    // test above pins that guard directly), so this asserts the OTHER path
    // never dispatches a subscriber `error()` either.
    expect(errored).toBe(false);
    await host.runtime.dispose();
  });

  it("pushReconnectIntent() lands a 'reconnect' event on the RxJS core's reconnect$ seam", () => {
    const seen: unknown[] = [];
    const sub = reconnect$.subscribe((e) => {
      seen.push(e);
    });
    pushReconnectIntent();
    expect(seen).toEqual([{ type: "reconnect" }]);
    sub.unsubscribe();
  });

  const hosts: EffectHost[] = [];

  function useHost(): EffectHost {
    const host = createHost();
    hosts.push(host);
    return host;
  }
});

/** A host of the same shape `composeWithBase` builds: a ManagedRuntime plus
 * the scope every stream fiber is forked into. */
function createHost(): EffectHost {
  return {
    runtime: ManagedRuntime.make(Layer.empty),
    scope: Effect.runSync(Scope.make()),
  };
}

async function closeHost(host: EffectHost): Promise<void> {
  await Effect.runPromise(Scope.close(host.scope, Exit.void));
  await host.runtime.dispose();
}

/** A stream that never ends and reports its own interruption. */
function createNeverStream(): NeverStream {
  let interrupted = false;
  const stream = Stream.fromEffect(
    Effect.never.pipe(
      Effect.onInterrupt(() => {
        return Effect.sync(() => {
          interrupted = true;
        });
      }),
    ),
  );
  return {
    stream,
    wasInterrupted: () => {
      return interrupted;
    },
  };
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

interface NeverStream {
  stream: Stream.Stream<never>;
  wasInterrupted: () => boolean;
}
