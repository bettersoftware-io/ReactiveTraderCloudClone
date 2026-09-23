import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Option,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import { BehaviorSubject, Subject, type Subscription } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { incident$, reconnect$ } from "@rtc/client-core";

import {
  createChildHost,
  createDetachedHost,
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  fromPortIn,
  pushIncidentEvent,
  pushReconnectIntent,
  refToStateStream,
  refToWarmStateStream,
  reportOutOfBand,
  scopedPortStream,
  setRefIfChanged,
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
        return Option.some(1);
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
        return Option.some(0);
      },
      run: (update: FoldUpdate<number>, fromPort: FromPort) => {
        return fromPort(subject).pipe(
          Stream.runForEach((e: number) => {
            return update((s) => {
              return (
                Option.getOrElse(s, () => {
                  return 0;
                }) + e
              );
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
        return Option.some(0);
      },
      run: (update: FoldUpdate<number>, fromPort: FromPort) => {
        return fromPort(subject).pipe(
          Stream.runForEach((e: number) => {
            return update((s) => {
              return (
                Option.getOrElse(s, () => {
                  return 0;
                }) + e
              );
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
        return Option.some(0);
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
        return Option.some(1);
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
        return (
          Option.getOrElse(current, () => {
            return 0;
          }) + 1
        );
      }),
    );
    await tick();
    expect(seen).toEqual([1, 2]);
    sub.unsubscribe();
  });

  it("sharedFold() re-seeds on every cold → warm cycle", async () => {
    const writes: FoldUpdate<number>[] = [];
    let seeds = 0;
    const host = useHost();
    const stream = sharedFold(host, {
      seed: () => {
        seeds += 1;
        return Option.some(seeds * 10);
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
    // The stale half of this case is gone with the generation counter: each
    // period owns its OWN ref, so a dead period's producer writing late
    // lands in a ref nothing is subscribed to — unobservable by
    // construction, with nothing left to assert. What remains observable is
    // that the LIVE period's writes still land.
    await host.runtime.runPromise(
      (writes[1] as FoldUpdate<number>)(() => {
        return 21;
      }),
    );
    await tick();
    expect(second).toEqual([20, 21]);
    secondSub.unsubscribe();
  });

  it("sharedFold() with a None seed delivers nothing until the first write, then replays it", async () => {
    const writes: FoldUpdate<number>[] = [];
    const host = useHost();
    const stream = sharedFold(host, {
      seed: () => {
        return Option.none();
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
    expect(seen).toEqual([]);
    await tick();
    await host.runtime.runPromise(
      (writes[0] as FoldUpdate<number>)(() => {
        return 7;
      }),
    );
    await tick();
    expect(seen).toEqual([7]);
    const late: number[] = [];
    const lateSub = stream.subscribe((v: number) => {
      late.push(v);
    });
    expect(late).toEqual([7]);
    lateSub.unsubscribe();
    sub.unsubscribe();
  });

  it("sharedFold() fails only the triggering subscriber when seed() throws, and starts no period", () => {
    let runs = 0;
    const stream = sharedFold(useHost(), {
      seed: () => {
        throw new Error("storage");
      },
      run: () => {
        runs += 1;
        return Effect.never;
      },
    });
    let failure: unknown;
    stream.subscribe({
      error: (e: unknown) => {
        failure = e;
      },
    });
    expect((failure as Error).message).toBe("storage");
    // A second subscribe tries again (no period was left half-open).
    let second: unknown;
    stream.subscribe({
      error: (e: unknown) => {
        second = e;
      },
    });
    expect((second as Error).message).toBe("storage");
    // "starts no period" said out loud: neither subscribe reached the
    // producer at all, so there is nothing warm to leak.
    expect(runs).toBe(0);
  });

  it("sharedFold() a stale period's producer failing after a re-warm does not error the new period's subscribers", async () => {
    let failFirst: (() => void) | undefined;
    let resumedWithFailure = false;
    let runs = 0;
    const host = useHost();
    const stream = sharedFold(host, {
      seed: () => {
        return Option.some(0);
      },
      run: () => {
        runs += 1;

        if (runs === 1) {
          return Effect.async<void, Error>((resume) => {
            failFirst = () => {
              resumedWithFailure = true;
              resume(Effect.fail(new Error("stale")));
            };
          });
        }

        return Effect.never;
      },
    });
    const first = stream.subscribe(() => {});
    await tick();
    first.unsubscribe();
    // Before the close reaches the first producer, a new period starts …
    const errors: unknown[] = [];
    const second = stream.subscribe({
      next: () => {},
      error: (e: unknown) => {
        errors.push(e);
      },
    });
    // … and the first producer fails late.
    failFirst?.();
    await tick();
    await tick();
    expect(runs).toBe(2);
    // An empty `errors` alone would also hold if the scope close had
    // interrupted the first producer BEFORE `failFirst()` ran — a vacuous
    // pass. This witnesses that the stale producer really did resume with a
    // non-interrupt failure, so the empty `errors` is the guard working.
    expect(resumedWithFailure).toBe(true);
    expect(errors).toEqual([]);
    second.unsubscribe();
  });

  it("sharedFold() releases a port subscription its producer opened through fromPort but never ran", async () => {
    const subject = new Subject<number>();
    const stream = sharedFold(useHost(), {
      seed: () => {
        return Option.some(0);
      },
      run: (_update: FoldUpdate<number>, fromPort: FromPort) => {
        fromPort(subject);
        return Effect.never;
      },
    });
    const sub = stream.subscribe(() => {});
    expect(subject.observed).toBe(true);
    sub.unsubscribe();
    await tick();
    await tick();
    expect(subject.observed).toBe(false);
  });

  it("sharedFold() surfaces a producer failure as an Observable error", async () => {
    const boom = new Error("boom");
    const stream = sharedFold(useHost(), {
      seed: () => {
        return Option.some(0);
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
        return Option.some(0);
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

  it("sharedFold() a subscriber that resubscribes synchronously from its error() handler after a producer failure starts a FRESH period", async () => {
    const boom = new Error("boom");
    const firstPort = new Subject<number>();
    let portWasSubscribed = false;
    let seeds = 0;
    let runs = 0;
    const host = useHost();
    const stream = sharedFold(host, {
      seed: () => {
        seeds += 1;
        return Option.some(seeds);
      },
      run: (_update: FoldUpdate<number>, fromPort: FromPort) => {
        runs += 1;

        if (runs === 1) {
          // Opened through `fromPort`, so ONLY the period's scope closing
          // releases it: the probe for "the failed period really ended",
          // rather than a period left open with a subscription pinned.
          fromPort(firstPort);
          portWasSubscribed = firstPort.observed;
          return Effect.fail(boom);
        }

        return Effect.never;
      },
    });

    let resubscription: Subscription | undefined;
    const resubscribed: number[] = [];
    stream.subscribe({
      next: () => {},
      error: () => {
        // RxJS invokes this BEFORE the failing subscriber's own unsubscribe
        // and while `startWarmPeriod` is still on the stack, so the failed
        // period has to have been ended by the fan-out itself for this to
        // start a new one instead of joining the dead one.
        resubscription = stream.subscribe((v: number) => {
          resubscribed.push(v);
        });
      },
    });

    expect(runs).toBe(2);
    // A second `seed()` call, and its value — not period 1's stale `1`,
    // which is what joining the dead period would have delivered (followed
    // by nothing, forever).
    expect(resubscribed).toEqual([2]);
    await tick();
    await tick();
    // Non-vacuous: the port WAS subscribed when the producer opened it, so
    // `observed === false` now is a release, not an absence.
    expect(portWasSubscribed).toBe(true);
    expect(firstPort.observed).toBe(false);
    resubscription?.unsubscribe();
  });

  it("sharedFold() a synchronous resubscribe from error() owns the live period — the failed period's teardown never displaces it", async () => {
    // `.pipe(retry(1))` does NOT reach this path — rxjs's own `retry`
    // guards a synchronous first-subscribe failure with a `syncUnsub` flag
    // and defers its resubscribe until AFTER the outer `subscribe()` call
    // has returned (measured against rxjs 7.8.2's `retry.js`), by which
    // point the failing subscribe's own bookkeeping has finished. A raw
    // resubscribe from inside a plain `error()` handler has no such guard
    // and runs the nested `subscribe()` truly synchronously — still inside
    // `startWarmPeriod()` for the period that just failed.
    const boom = new Error("boom");
    let seeds = 0;
    let attempts = 0;
    let nestedInterrupted = false;
    const host = useHost();
    const stream = sharedFold(host, {
      seed: () => {
        seeds += 1;
        return Option.some(seeds);
      },
      // Fails at once on the FIRST attempt (the failure whose synchronous
      // fan-out drives the resubscribe below); a live producer on any later
      // one.
      run: () => {
        attempts += 1;

        if (attempts === 1) {
          return Effect.fail(boom);
        }

        return Effect.never.pipe(
          Effect.onInterrupt(() => {
            return Effect.sync(() => {
              nestedInterrupted = true;
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
    expect(nestedSeen).toEqual([2]);
    expect(attempts).toBe(2);

    // The live period is the NESTED one, and the failed subscribe's
    // remaining bookkeeping — which resumes right after `error()` returns,
    // with its own, dead period object in hand — must not displace it. A
    // further subscriber arriving while the nested period is still open is
    // what discriminates: it has to JOIN that period (no third `seed()`,
    // the nested period's own value on the wire). Were the dead period
    // reinstated as the live one on `startWarmPeriod`'s return, the failed
    // subscriber's own immediate teardown would then null `warm` out from
    // under the live nested period, and this subscribe would strand it
    // behind a third.
    const joiner: number[] = [];
    const joinerSub = stream.subscribe((v: number) => {
      joiner.push(v);
    });
    expect(seeds).toBe(2);
    expect(joiner).toEqual([2]);
    joinerSub.unsubscribe();

    // And with nothing stranded, the nested period's producer interrupts
    // normally on its last unsubscribe.
    nested?.unsubscribe();
    await tick();
    expect(nestedInterrupted).toBe(true);
  });

  it("sharedFold() producers are interrupted when the host scope closes", async () => {
    const host = createHost();
    let interrupted = false;
    let errored = false;
    const stream = sharedFold(host, {
      seed: () => {
        return Option.some(0);
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

  it("pushIncidentEvent() lands the event on the RxJS core's incident$ seam", () => {
    const seen: unknown[] = [];
    const sub = incident$.subscribe((e) => {
      seen.push(e);
    });
    pushIncidentEvent({ type: "gatewayDisconnected" });
    expect(seen).toEqual([{ type: "gatewayDisconnected" }]);
    sub.unsubscribe();
  });

  it("refToStateStream runs onSubscribe on each zero-to-one subscriber transition, not per subscriber", async () => {
    const host = useHost();
    const ref = Effect.runSync(SubscriptionRef.make(1));
    let starts = 0;
    const state$ = refToStateStream(host, ref, () => {
      starts += 1;
    });
    const a = state$.subscribe(() => {});
    const b = state$.subscribe(() => {});
    expect(starts).toBe(1);
    a.unsubscribe();
    b.unsubscribe();
    state$.subscribe(() => {}).unsubscribe();
    expect(starts).toBe(2);
  });

  it("sharedFold({ retain: true }) keeps the period across zero subscribers and ends it with the host scope", async () => {
    const host = useHost();
    const subject = new BehaviorSubject<number>(1);
    const stream = sharedFold(host, {
      retain: true,
      seed: () => {
        return Option.none();
      },
      run: (update: FoldUpdate<number>, fromPort: FromPort) => {
        return fromPort(subject).pipe(
          Stream.runForEach((v: number) => {
            return update(() => {
              return v;
            });
          }),
        );
      },
    });
    stream.subscribe(() => {}).unsubscribe();
    await tick();
    expect(subject.observed).toBe(true);
    const seen: number[] = [];
    stream.subscribe((v: number) => {
      seen.push(v);
    });
    expect(seen).toEqual([1]);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(subject.observed).toBe(false);
  });

  it("setRefIfChanged publishes a changed value and skips an Object.is-equal one", async () => {
    const host = useHost();
    const ref = host.runtime.runSync(SubscriptionRef.make(1));
    const seen: number[] = [];
    const sub = refToStateStream(host, ref).subscribe((v: number) => {
      seen.push(v);
    });
    await tick();
    host.runtime.runSync(
      setRefIfChanged(ref, () => {
        return 1;
      }),
    );
    host.runtime.runSync(
      setRefIfChanged(ref, () => {
        return 2;
      }),
    );
    await tick();
    await tick();
    expect(seen).toEqual([1, 2]);
    sub.unsubscribe();
  });

  it("fromPortIn(scope) subscribes at once and the scope's close releases it", async () => {
    const subject = new Subject<number>();
    const scope = Effect.runSync(Scope.make());
    fromPortIn(scope)(subject);
    expect(subject.observed).toBe(true);
    await Effect.runPromise(Scope.close(scope, Exit.void));
    expect(subject.observed).toBe(false);
  });

  it("createDetachedHost() runs effects on the default runtime under a scope of its own", async () => {
    const host = createDetachedHost();
    expect(host.runtime.runSync(Effect.succeed(3))).toBe(3);
    let interrupted = false;
    host.runtime.runFork(
      Effect.never.pipe(
        Effect.onInterrupt(() => {
          return Effect.sync(() => {
            interrupted = true;
          });
        }),
      ),
      { scope: host.scope },
    );
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(interrupted).toBe(true);
  });

  it("reportOutOfBand rethrows a squashed cause on a macrotask", () => {
    vi.useFakeTimers();
    reportOutOfBand(Cause.fail(new Error("machine")));
    expect(() => {
      vi.runAllTimers();
    }).toThrow("machine");
    vi.useRealTimers();
  });

  it("scopedPortStream() calls open when the stream RUNS, not when it is built — and once per run", async () => {
    const first = new Subject<number>();
    const second = new Subject<number>();
    const opened: Subject<number>[] = [];
    const sources = [first, second];
    const stream = scopedPortStream<number>(() => {
      const source = sources[opened.length] as Subject<number>;
      opened.push(source);
      return source;
    });
    // Built, not run: nothing called, nothing subscribed.
    expect(opened).toEqual([]);
    expect(first.observed).toBe(false);

    const firstRun = Effect.runFork(
      Stream.runForEach(stream, () => {
        return Effect.void;
      }),
    );
    await tick();
    expect(opened).toEqual([first]);
    expect(first.observed).toBe(true);

    // A SECOND run of the same value is a second port call, with its own
    // subscription — the property `rpc` has and a hoisted `fromObservable`
    // does not.
    const secondRun = Effect.runFork(
      Stream.runForEach(stream, () => {
        return Effect.void;
      }),
    );
    await tick();
    expect(opened).toEqual([first, second]);
    expect(second.observed).toBe(true);

    await Effect.runPromise(Fiber.interrupt(firstRun));
    await Effect.runPromise(Fiber.interrupt(secondRun));
  });

  it("scopedPortStream() delivers every value in order and ends on the source's completion", async () => {
    const subject = new Subject<number>();
    const seen: number[] = [];
    const drained = Effect.runPromise(
      Stream.runForEach(
        scopedPortStream(() => {
          return subject;
        }),
        (value: number) => {
          return Effect.sync(() => {
            seen.push(value);
          });
        },
      ),
    );
    await tick();
    subject.next(1);
    subject.next(2);
    subject.next(3);
    subject.complete();
    await drained;
    expect(seen).toEqual([1, 2, 3]);
  });

  it("scopedPortStream() releases the source when the running fiber is interrupted", async () => {
    const subject = new Subject<number>();
    const fiber = Effect.runFork(
      Stream.runForEach(
        scopedPortStream(() => {
          return subject;
        }),
        () => {
          return Effect.void;
        },
      ),
    );
    await tick();
    expect(subject.observed).toBe(true);
    await Effect.runPromise(Fiber.interrupt(fiber));
    await tick();
    expect(subject.observed).toBe(false);
  });

  it("scopedPortStream() fails the stream when the source errors", async () => {
    const boom = new Error("boom");
    const subject = new Subject<number>();
    const exit = Effect.runPromiseExit(
      Stream.runForEach(
        scopedPortStream(() => {
          return subject;
        }),
        () => {
          return Effect.void;
        },
      ),
    );
    await tick();
    subject.error(boom);
    expect(Exit.isFailure(await exit)).toBe(true);
  });

  it("createChildHost() ends with the parent scope", async () => {
    const parent = useHost();
    const child = createChildHost(parent);
    let released = false;
    Effect.runSync(
      Scope.addFinalizer(
        child.scope,
        Effect.sync(() => {
          released = true;
        }),
      ),
    );
    await Effect.runPromise(Scope.close(parent.scope, Exit.void));
    expect(released).toBe(true);
  });

  it("createChildHost() closing the CHILD leaves the parent open", async () => {
    const parent = useHost();
    const child = createChildHost(parent);
    let parentReleased = false;
    Effect.runSync(
      Scope.addFinalizer(
        parent.scope,
        Effect.sync(() => {
          parentReleased = true;
        }),
      ),
    );
    await Effect.runPromise(Scope.close(child.scope, Exit.void));
    expect(parentReleased).toBe(false);
    // Still usable: a later fork into the parent's scope is not stranded.
    expect(parent.runtime.runSync(Effect.succeed(1))).toBe(1);
  });

  it("createChildHost() still runs an effect after the parent ManagedRuntime is disposed", async () => {
    const parent = createHost();
    const child = createChildHost(parent);
    await parent.runtime.dispose();
    // The DEFAULT runtime, deliberately: an intent arriving after
    // `app.dispose()` must not die on a disposed managed runtime.
    expect(child.runtime.runSync(Effect.succeed(9))).toBe(9);
    await Effect.runPromise(Scope.close(parent.scope, Exit.void));
  });

  it("refToWarmStateStream() keeps a cold getValue() current, and release() is idempotent", async () => {
    const host = useHost();
    const ref = host.runtime.runSync(SubscriptionRef.make(1));
    // The contrast that makes the claim non-vacuous: a plain
    // `refToStateStream` with nobody subscribed hands back its
    // construction-time value however far the ref has moved.
    const cold = refToStateStream(host, ref);
    const warm = refToWarmStateStream(host, ref);
    host.runtime.runSync(
      setRefIfChanged(ref, () => {
        return 2;
      }),
    );
    await tick();
    expect(cold.getValue()).toBe(1);
    expect(warm.state$.getValue()).toBe(2);
    warm.release();
    warm.release();
    const seen: number[] = [];
    const sub = warm.state$.subscribe((value: number) => {
      seen.push(value);
    });
    expect(seen).toEqual([2]);
    sub.unsubscribe();
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host = createHost();
    hosts.push(host);
    return host;
  }
});

/** The host these tests build: a `ManagedRuntime` (which satisfies
 * `EffectRunner` structurally) plus the scope every stream fiber is forked
 * into — and, unlike the narrow `EffectHost`, the runtime's own
 * `runPromise`/`dispose`, which the cases drive directly. */
interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

function createHost(): TestHost {
  return {
    runtime: ManagedRuntime.make(Layer.empty),
    scope: Effect.runSync(Scope.make()),
  };
}

async function closeHost(host: TestHost): Promise<void> {
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
