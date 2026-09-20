import { state } from "@rx-state/core";
import {
  Cause,
  Deferred,
  Effect,
  ExecutionStrategy,
  Exit,
  Fiber,
  Option,
  Runtime,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import { filter, map, Observable, type Subscriber } from "rxjs";

import { reconnect$ } from "@rtc/client-core";
import type { Stream as CoreStream, StateStream } from "@rtc/core-api";

import { fromObservable } from "#/bridge/in";

/** What a host runs Effects with: the two operations every bridge helper
 * needs. A `ManagedRuntime` satisfies it structurally (the tests' `useHost`
 * keeps building one); `runnerFor` adapts a plain `Runtime` — what a Layer
 * captures with `Effect.runtime`, and what a detached machine host takes
 * from `Runtime.defaultRuntime`. */
export interface EffectRunner {
  runSync<A, E>(effect: Effect.Effect<A, E>): A;
  runFork<A, E>(
    effect: Effect.Effect<A, E>,
    options?: Runtime.RunForkOptions,
  ): Fiber.RuntimeFiber<A, E>;
}

/** What the bridge needs from the app to run Effects on its behalf: the
 * runner to run them with, and the scope every forked stream fiber is
 * attached to. `runFork` produces ROOT fibers — disposing a `ManagedRuntime`
 * does NOT interrupt them — so the scope is what makes the app able to end
 * them, and `composeWithBase` owns both. */
export interface EffectHost {
  readonly runtime: EffectRunner;
  readonly scope: Scope.CloseableScope;
}

export function runnerFor(runtime: Runtime.Runtime<never>): EffectRunner {
  return {
    runSync: Runtime.runSync(runtime),
    runFork: Runtime.runFork(runtime),
  };
}

/** A host for something that owns its own lifetime rather than the app's —
 * a machine: `createMachineFactories(presenters)` has no app handle, so each
 * machine forks under the default runtime into a scope of its own and
 * `dispose()` closes it (slice 2 ruling 8). */
export function createDetachedHost(): EffectHost {
  return {
    runtime: runnerFor(Runtime.defaultRuntime),
    scope: Effect.runSync(Scope.make()),
  };
}

/** `SubscriptionRef.set` that publishes only a changed value: a
 * `SubscriptionRef` re-publishes an equal `set` (measured on 3.22.2), and a
 * machine's `state$` promises `distinctUntilChanged`. The same guard
 * `sharedFold`'s `update` applies, for a ref a machine owns directly. */
export function setRefIfChanged<S>(
  ref: SubscriptionRef.SubscriptionRef<S>,
  next: (current: S) => S,
): Effect.Effect<void> {
  return SubscriptionRef.get(ref).pipe(
    Effect.flatMap((current) => {
      const value = next(current);
      return Object.is(value, current)
        ? Effect.void
        : SubscriptionRef.set(ref, value);
    }),
  );
}

/** A `FromPort` bound to a scope that is not a fold period's — a machine's
 * own. Same rule as the period-scoped one: call it once per port per scope;
 * the subscription exists from the moment it returns and the scope's close
 * releases it. */
export function fromPortIn(scope: Scope.Scope): FromPort {
  return <T>(source: CoreStream<T>) => {
    return fromObservable(source, scope);
  };
}

/** Rethrow a cause on a macrotask, outside every fiber — the Effect twin of
 * the async core's `reportAsync`, for a machine whose source failed and
 * whose `SubscriptionRef` has no error channel (slice 2 ruling 8). */
export function reportOutOfBand(cause: Cause.Cause<unknown>): void {
  setTimeout(() => {
    throw Cause.squash(cause);
  }, 0);
}

/** Run an Effect Stream under each Observable subscribe as a forked fiber;
 * unsubscribe interrupts it. Typed errors are squashed to one `unknown`
 * at this boundary and nowhere else.
 *
 * An interrupt-only cause (the app's scope closing on `dispose()`, or this
 * subscriber's own unsubscribe) leaves the subscriber neither errored nor
 * completed — deliberately: the RxJS core's `dispose()` is a knowing no-op
 * today, so a still-attached RxJS subscriber hears nothing after dispose
 * either; completion-on-dispose becomes the contract when the RxJS
 * `Subscription` bag lands (§22). */
export function streamToStream<T, E>(
  host: EffectHost,
  stream: Stream.Stream<T, E>,
): CoreStream<T> {
  return new Observable<T>((subscriber) => {
    const fiber = host.runtime.runFork(
      Stream.runForEach(stream, (value) => {
        return Effect.sync(() => {
          subscriber.next(value);
        });
      }).pipe(
        Effect.matchCauseEffect({
          onFailure: (cause: Cause.Cause<E>) => {
            return Effect.sync(() => {
              if (!Cause.isInterruptedOnly(cause)) {
                subscriber.error(Cause.squash(cause));
              }
            });
          },
          onSuccess: () => {
            return Effect.sync(() => {
              subscriber.complete();
            });
          },
        }),
      ),
      // Attach to the app's scope so closing it interrupts whatever is still
      // running — otherwise these fibers outlive the app entirely.
      { scope: host.scope },
    );

    return () => {
      // The GLOBAL runtime, deliberately, NOT `host.runtime`: `dispose()`
      // replaces the managed runtime's effect with `die("ManagedRuntime
      // disposed")`, so an unsubscribe arriving after dispose would fork a
      // fiber that dies with an unhandled defect while leaving this fiber
      // running. Interrupting needs no context, so the default runtime does.
      Effect.runFork(Fiber.interrupt(fiber));
    };
  });
}

/** A SubscriptionRef as a warm StateStream.
 *
 * The current value is read PER SUBSCRIPTION, not once at construction:
 * `@rx-state/core`'s `StateObservable` subscribes its source lazily and, at
 * refCount 0, drops `currentValue` and unsubscribes — so a value captured at
 * construction would be re-emitted, stale, on every cold → warm cycle, and
 * any `set` made before the first subscriber would be invisible.
 *
 * `ref.changes` REPLAYS the current value to each subscriber, which would
 * duplicate the seed we just emitted. The replayed head is therefore dropped
 * only when it is `Object.is`-equal to that seed — never blindly: if a `set`
 * lands between the read and the fiber's subscribe, the head carries the NEW
 * value and must be delivered. */
export function refToStateStream<S>(
  host: EffectHost,
  ref: SubscriptionRef.SubscriptionRef<S>,
): StateStream<S> {
  function readCurrent(): S {
    return host.runtime.runSync(SubscriptionRef.get(ref));
  }

  const perSubscription = new Observable<S>((subscriber) => {
    const seed = readCurrent();
    subscriber.next(seed);

    return streamToStream(host, ref.changes)
      .pipe(
        filter((value, index) => {
          return index > 0 || !Object.is(value, seed);
        }),
      )
      .subscribe(subscriber);
  });

  // `state()` requires a default — there is no single-argument overload. It
  // is read once, at construction, and is observable ONLY through a COLD
  // `getValue()` (no subscriber yet), which hands back that construction-time
  // value however stale the ref has since become. No SUBSCRIBER ever sees it:
  // `StateObservable` emits its default only when the source has NOT already
  // emitted by the end of `source$.subscribe(...)`, and `perSubscription`
  // always emits synchronously there — every subscription re-reads the ref.
  // The cold → warm test pins that, by seeing the ref's latest value rather
  // than this one.
  return state(perSubscription, readCurrent());
}

/** How a `sharedFold` producer writes its state: apply `next` to the
 * current value (`None` until the period's first write, for a seedless
 * period) and publish the result only if it is not `Object.is`-equal to the
 * current one — a `SubscriptionRef` re-publishes an equal `set` (measured on
 * 3.22.2), which would hand every subscriber the seed twice. The first write
 * of a period waits for the period's watcher to have subscribed the ref's
 * PubSub (`WarmPeriod.watching`) — the structural close of the race a
 * `yieldNow` used to win. A consequence a caller must know: an Effect-core
 * fold CONFLATES equal consecutive states (the RxJS core's `scan`/`map` do
 * not). */
export type FoldUpdate<S> = (
  next: (current: Option.Option<S>) => S,
) => Effect.Effect<void>;

/** How a `sharedFold` producer subscribes a port: the subscription belongs
 * to the period, released when the period ends whether or not the stream
 * ran (`fromObservable`'s scope argument). Each call subscribes the source
 * and adds a finalizer that lives as long as the period, so a producer
 * calls this ONCE PER PORT PER PERIOD — never per event, which would pile
 * up one subscription and one finalizer per value for the period's whole
 * life. Named rather than inlined into `FoldRun` because every producer has
 * to annotate the parameter. */
export type FromPort = <T>(source: CoreStream<T>) => Stream.Stream<T, unknown>;

/** The producer of one warm period, handed the period's `update` and its
 * own `fromPort`. */
export type FoldRun<S> = (
  update: FoldUpdate<S>,
  fromPort: FromPort,
) => Effect.Effect<void, unknown>;

export interface SharedFold<S> {
  /** The value a warm period starts from — read on EVERY first subscribe:
   * `Some` for a port mirror whose port emitted synchronously (`peekCurrent`)
   * or a pure fold's constant, `None` for a port that has not emitted yet,
   * in which case subscribers hear nothing until the first write. A throwing
   * `seed` fails the subscriber that triggered it. */
  readonly seed: () => Option.Option<S>;
  readonly run: FoldRun<S>;
  /** Keep the warm period across zero subscribers; only the host scope
   * ends it — the RxJS core's `warmReplay()` for a session singleton. */
  readonly retain?: boolean;
}

interface WarmPeriod<S> {
  scope: Scope.CloseableScope;
  /** THIS period's subscribers — failure fans out to these and no others, so
   * a stale period's producer failing in the unsubscribe → close window
   * cannot error a later period's subscribers. */
  subscribers: Set<Subscriber<S>>;
  changes: CoreStream<S>;
}

/** Two `Option`s hold the same state: both `None`, or both `Some` of
 * `Object.is`-equal values. */
function sameState<S>(a: Option.Option<S>, b: Option.Option<S>): boolean {
  if (Option.isNone(a) || Option.isNone(b)) {
    return Option.isNone(a) && Option.isNone(b);
  }

  return Object.is(a.value, b.value);
}

/** A period's ref as a replay-current Observable of its `Some` values: the
 * current value (if any) synchronously, then later values. The head
 * `ref.changes` replays is dropped only when it equals what was just
 * delivered — a `set` between the read and the watcher's subscribe carries a
 * NEW value and must arrive. The first emission the watcher sees succeeds
 * `watching`, which is what `update` awaits.
 *
 * What each subscriber is promised differs, and the difference is worth
 * stating: the period's FIRST subscriber receives every intermediate state
 * of a same-tick burst, because the producer's first write blocks on
 * `watching` until that subscriber's watcher has subscribed the PubSub. A
 * LATER joiner has no such latch — the Deferred is already done — so its
 * watcher subscribes a fiber-step after its synchronous head read, and any
 * burst landing in that window is conflated into the head it just
 * delivered. That is the same window `refToStateStream` documents: a late
 * joiner can miss INTERMEDIATE values, never see a stale one. Conflation,
 * not staleness. */
function periodStream<S>(
  host: EffectHost,
  ref: SubscriptionRef.SubscriptionRef<Option.Option<S>>,
  watching: Deferred.Deferred<void>,
): CoreStream<S> {
  return new Observable<S>((subscriber) => {
    const seed = host.runtime.runSync(SubscriptionRef.get(ref));

    if (Option.isSome(seed)) {
      subscriber.next(seed.value);
    }

    return streamToStream(
      host,
      ref.changes.pipe(
        Stream.tap(() => {
          return Deferred.succeed(watching, undefined);
        }),
      ),
    )
      .pipe(
        filter((value, index) => {
          return index > 0 || !sameState(value, seed);
        }),
        filter(Option.isSome),
        map((value) => {
          return value.value;
        }),
      )
      .subscribe(subscriber);
  });
}

/** `shareReplay({ bufferSize: 1, refCount: true })` restated over a
 * `SubscriptionRef` and a `Scope`. The FIRST subscriber seeds the ref and
 * forks `run` into a scope of its own — a child of the app's, so
 * `dispose()` still ends it; every subscriber reads the ref's current value
 * synchronously and then follows `ref.changes` on the scheduler; the LAST
 * unsubscribe closes the scope, interrupting the producer and releasing every
 * port subscription the producer opened through `fromPort`. `Stream.share`
 * cannot be this envelope: it replays to a new subscriber on a fiber, never
 * in the caller's tick. */
export function sharedFold<S>(
  host: EffectHost,
  fold: SharedFold<S>,
): CoreStream<S> {
  let warm: WarmPeriod<S> | null = null;

  /** End a period: drop it as the live one (when it still is) and close its
   * scope, interrupting the producer and releasing every port subscription
   * `fromPort` opened. Both ways a period ends go through here — the last
   * unsubscribe and the failure fan-out — and they may overlap (a failed
   * period's subscribers still tear down after their `error()`), which is
   * safe: `Scope.close` on an already-closed scope is a no-op (measured on
   * 3.22.2, `ScopeImpl.close` returns `void` for a `Closed` state). */
  function endPeriod(period: WarmPeriod<S>): void {
    if (warm === period) {
      warm = null;
    }

    // The global runtime, as in `streamToStream`: this must still work
    // after `host.runtime` has been disposed.
    Effect.runFork(Scope.close(period.scope, Exit.void));
  }

  // The seed arrives already evaluated: `fold.seed()` is the ONE thing
  // allowed to throw, and it is called by the subscribe function below,
  // outside this. Nothing in here may throw — by the time `warm = period`
  // has run, a scope is forked and the producer's ports are subscribed, so
  // a throw escaping here would leave `warm` pointing at a period with no
  // producer: later subscribers would join the zombie, hear the seed and
  // nothing else, and the scope would never be closed.
  function startWarmPeriod(
    first: Subscriber<S>,
    seed: Option.Option<S>,
  ): WarmPeriod<S> {
    const scope = host.runtime.runSync(
      Scope.fork(host.scope, ExecutionStrategy.sequential),
    );
    const ref = host.runtime.runSync(SubscriptionRef.make(seed));
    const watching = host.runtime.runSync(Deferred.make<void>());
    const period: WarmPeriod<S> = {
      scope,
      subscribers: new Set([first]),
      changes: periodStream(host, ref, watching),
    };
    // Assigned BEFORE `runFork`: a producer that fails at once fans that
    // failure out while this call is still on the stack, and the fan-out
    // has to find `warm` pointing at THIS period to be able to end it. That
    // is the whole of the re-entrancy guarantee — the period is published
    // before anything can run — NOT that a nested subscribe joins this
    // period: the fan-out ends the period first, so a resubscribe from a
    // subscriber's `error()` deliberately starts a fresh one.
    warm = period;

    // MEASURED (effect 3.22.2): a `SubscriptionRef` publishes into a
    // `PubSub.unbounded()`, and `ref.changes` is `Ref.get →
    // PubSub.subscribe → concat(head, fromPubSub(...))` — so once the
    // watcher fiber (forked inside `periodStream`) has subscribed to that
    // PubSub, EVERY publish reaches it in order; there is no conflation of a
    // fast burst against a slow watcher. The only values a watcher can miss
    // are ones published BEFORE its PubSub subscription exists: a producer
    // forked ahead of the watcher that drains several already-queued events
    // (`fromObservable`'s Queue — see `in.ts`) in one uninterrupted burst
    // publishes them all before the watcher fiber has started, so the
    // watcher's `Ref.get` head observes only the final value and the PubSub
    // never had a subscriber for the intermediate ones — `[6]` instead of
    // `[1, 3, 6]`. The latch `update` awaits is the structural close.
    function update(
      next: (current: Option.Option<S>) => S,
    ): Effect.Effect<void> {
      return Deferred.await(watching).pipe(
        Effect.andThen(SubscriptionRef.get(ref)),
        Effect.flatMap((current) => {
          const value = Option.some(next(current));
          return sameState(value, current)
            ? Effect.void
            : SubscriptionRef.set(ref, value);
        }),
      );
    }

    function fromPort<T>(source: CoreStream<T>): Stream.Stream<T, unknown> {
      return fromObservable(source, scope);
    }

    host.runtime.runFork(
      fold.run(update, fromPort).pipe(
        Effect.catchAllCause((cause) => {
          return Effect.sync(() => {
            if (Cause.isInterruptedOnly(cause)) {
              return;
            }

            // END the period BEFORE erroring anyone. RxJS invokes a
            // consumer's `error` callback ahead of its own unsubscribe, so
            // a subscriber that resubscribes synchronously from inside
            // `error()` would otherwise find `warm` still pointing at this
            // dead period and join it: measured, it receives the stale seed
            // and then nothing, forever, and the scope never closes.
            // Ended first, that resubscribe sees `warm === null` and starts
            // a FRESH period — the shape an async failure already had.
            const failing = [...period.subscribers];
            period.subscribers.clear();
            endPeriod(period);

            for (const subscriber of failing) {
              subscriber.error(Cause.squash(cause));
            }
          });
        }),
      ),
      { scope },
    );

    return period;
  }

  return new Observable<S>((subscriber) => {
    let period: WarmPeriod<S>;

    if (warm === null) {
      // `seed()` may throw (a port that errors on subscribe, via
      // `peekCurrent`). Read it HERE, before anything is warm, so the
      // thrower is the only subscriber to tell and no half-built period is
      // left behind — `startWarmPeriod` takes the value, never the thunk.
      let seed: Option.Option<S>;

      try {
        seed = fold.seed();
      } catch (error) {
        subscriber.error(error);
        return () => {};
      }

      // The RETURNED period, never `warm` re-read: `startWarmPeriod`
      // publishes the period itself, and a producer that fails
      // synchronously has already ended it — possibly with a resubscribe
      // from its `error()` having published a successor — by the time this
      // returns. Re-reading `warm` here would resurrect the dead period on
      // top of that successor.
      period = startWarmPeriod(subscriber, seed);
    } else {
      period = warm;
      period.subscribers.add(subscriber);
    }

    const inner = period.changes.subscribe(subscriber);

    return () => {
      inner.unsubscribe();
      period.subscribers.delete(subscriber);

      if (period.subscribers.size === 0 && fold.retain !== true) {
        endPeriod(period);
      }
    };
  });
}

/** Push the user's reconnect intent into the RxJS core's module-level
 * `reconnect$`. Both web clients' `buildBrowserPorts` merge that Subject into
 * `connectionEvents` for EVERY core, so a native `commands.reconnect` has to
 * speak to it or be unobservable in the browser. It is a Subject, which is
 * why the call lives in the bridge; slice 8 moves the seam out of
 * `@rtc/client-core`. */
export function pushReconnectIntent(): void {
  reconnect$.next({ type: "reconnect" });
}
