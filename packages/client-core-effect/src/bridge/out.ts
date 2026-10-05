import { state } from "@rx-state/core";
import {
  Cause,
  Effect,
  ExecutionStrategy,
  Exit,
  Fiber,
  FiberRef,
  Option,
  Runtime,
  Scope,
  Stream,
} from "effect";
import { Observable, type Subscriber } from "rxjs";

import type { Stream as CoreStream, StateStream } from "@rtc/core-api";

import {
  fromObservable,
  fromObservables,
  type PortEvents,
  releasePorts,
} from "#/bridge/in";
import { turnScheduler } from "#/bridge/turnScheduler";

export { portEvents } from "#/bridge/in";

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
 * them, and `composeApp` owns both. */
export interface EffectHost {
  readonly runtime: EffectRunner;
  readonly scope: Scope.CloseableScope;
}

/** Every host's runner goes through here, so this is where the core's
 * fibers are put on the turn scheduler (`bridge/turnScheduler.ts`): whatever
 * one event makes them do is done within one turn. */
export function runnerFor(runtime: Runtime.Runtime<never>): EffectRunner {
  const settling = Runtime.setFiberRef(
    runtime,
    FiberRef.currentScheduler,
    turnScheduler,
  );

  return {
    runSync: Runtime.runSync(settling),
    runFork: Runtime.runFork(settling),
  };
}

/** The DEFAULT runtime, on the turn scheduler: what runs an effect that must
 * still work whatever has become of a host — a machine's own fibers, and
 * every interrupt and scope close made from plain code (`interruptFiber`,
 * `closeScope`). `app.dispose()` replaces a managed runtime's effect with
 * `die("ManagedRuntime disposed")`, so an unsubscribe arriving after it
 * could not be run there; ending a fiber needs no context, so the default
 * runtime does. */
const detached: EffectRunner = runnerFor(Runtime.defaultRuntime);

/** Interrupt a fiber from plain code — an unsubscribe, a superseded run —
 * without waiting for it to end. Through the bridge like every other effect
 * run from plain code (grep gate 49), so there is one place that decides
 * what such an effect runs on. (Which scheduler THIS runs on is not
 * observable: the interrupt is signalled before the call returns either
 * way. The mutant that forks it with a bare `Effect.runFork` survives every
 * test, and is equivalent.) */
export function interruptFiber(
  fiber: Fiber.RuntimeFiber<unknown, unknown>,
): void {
  detached.runFork(Fiber.interrupt(fiber));
}

/** End a scope from plain code — a machine's `dispose()`, a fold period's
 * last unsubscribe — without waiting. Two steps, in this order:
 *
 * 1. its port subscriptions are released NOW (`releasePorts`, `bridge/in.ts`
 *    — which says why the close alone is not enough): nothing emitted after
 *    this call returns is received;
 * 2. the scope is closed on a fiber: finalizers run, and the fibers forked
 *    into it are interrupted.
 *
 * Never a bare `Effect.runFork(Scope.close(…))` (grep gate 49): that skips
 * step 1, which is the step that matters — with the ports released, which
 * scheduler the close itself runs on is not observable (an equivalent
 * mutant). Closing a closed scope is a no-op. */
export function closeScope(scope: Scope.CloseableScope): void {
  releasePorts(scope);
  detached.runFork(Scope.close(scope, Exit.void));
}

/** `closeScope`, resolving once every finalizer has run — for
 * `app.dispose()`, which promises its caller that. */
export function closeScopeAndWait(scope: Scope.CloseableScope): Promise<void> {
  releasePorts(scope);

  return new Promise<void>((resolve, reject) => {
    detached.runFork(Scope.close(scope, Exit.void)).addObserver((exit) => {
      if (Exit.isSuccess(exit)) {
        resolve();
        return;
      }

      reject(Cause.squash(exit.cause));
    });
  });
}

/** A host for something that owns its own lifetime rather than the app's —
 * a machine: `createMachineFactories(presenters)` has no app handle, so each
 * machine forks under the default runtime into a scope of its own and
 * `dispose()` closes it (slice 2 ruling 8). */
export function createDetachedHost(): EffectHost {
  return {
    runtime: detached,
    scope: Effect.runSync(Scope.make()),
  };
}

/** A host for an app-lifetime machine: the DEFAULT runtime as the runner —
 * an intent that arrives after `app.dispose()` must not die on a disposed
 * managed runtime — and a scope forked from the app host's, so
 * `app.dispose()` ends the machine. The middle ground between
 * `createDetachedHost` (a per-mount machine, whose lifetime is its own) and
 * a fold period's scope (a warm period's). */
export function createChildHost(parent: EffectHost): EffectHost {
  return {
    runtime: detached,
    scope: Effect.runSync(
      Scope.fork(parent.scope, ExecutionStrategy.sequential),
    ),
  };
}

/** A per-call, multi-value port stream as an Effect Stream, owned by the
 * stream's own scope: `open()` is called — and the port subscribed — when
 * the stream STARTS (lazy until run; two runs are two port calls), and
 * released when that scope closes, whether the stream ended, failed, or its
 * fiber was interrupted. The lifecycle twin of `rpc`.
 *
 * MEASURED on effect 3.22.2 (`bridge/out.test.ts`, the four
 * `scopedPortStream()` cases): `Stream.unwrapScoped` keeps the scope it
 * provides open for as long as the resulting stream is being consumed — the
 * finalizer `fromObservable` registers on it runs at the END of the run, not
 * before the inner stream is drained, so values still flow and an interrupt
 * of the running fiber is what releases the source. `Effect.scope` is
 * re-evaluated per run, which is why `open()` is per run rather than per
 * value: the eager subscribe `fromObservable` performs then happens inside
 * the run, not at build time. The brief's `Stream.acquireRelease` fallback
 * (a `Scope.fork` of the fiber's own scope, closed in the release) was
 * therefore not needed. */
export function scopedPortStream<T>(
  open: () => CoreStream<T>,
): Stream.Stream<T, unknown> {
  return Stream.unwrapScoped(
    Effect.map(Effect.scope, (scope) => {
      return fromObservable(open(), scope);
    }),
  );
}

/** A `StateStream` and the release of its keep-warm. */
export interface WarmStateStream<S> {
  readonly state$: StateStream<S>;
  release(): void;
}

/** A state stream over a synchronous `listen` — NOT held warm: `listen`
 * runs on the first subscriber only (a lazily opened source, e.g. a port the
 * app should reach only once someone reads it), and the current value
 * replays to each subscriber. */
export function listenToStateStream<S>(
  listen: (listener: (value: S) => void) => () => void,
  current: () => S,
): StateStream<S> {
  const source = new Observable<S>((subscriber) => {
    return listen((value) => {
      subscriber.next(value);
    });
  });
  return state(source, current());
}

/** A warm `StateStream` fed SYNCHRONOUSLY by an in-core listener — for
 * state whose commits must reach a subscriber in the same tick (the
 * workspace's `SyncRef`). `listen` replays the current value on attach, so
 * the shared subscription starts from it; the keep-warm holds that one
 * subscription for the singleton's life, and a late subscriber joins on the
 * value the last commit delivered — never one a fiber has yet to deliver. */
export function listenToWarmStateStream<S>(
  listen: (listener: (value: S) => void) => () => void,
  current: () => S,
): WarmStateStream<S> {
  const source = new Observable<S>((subscriber) => {
    return listen((value) => {
      subscriber.next(value);
    });
  });
  const state$ = state(source, current());
  const warm = state$.subscribe();

  return {
    state$,
    release: () => {
      warm.unsubscribe();
    },
  };
}

/** Hold a stream warm with a subscription of its own (the RxJS presenters'
 * `data$.subscribe()` keep-warm) and hand back its release. The subscribe
 * lives here because the bridge owns rxjs. */
export function holdWarm<T>(stream: CoreStream<T>): () => void {
  // The keep-warm swallows a failure: the stream's REAL subscribers hear it,
  // and an unhandled copy from this silent holder would only be noise.
  const subscription = stream.subscribe({
    error: () => {
      // deliberately empty — see above
    },
  });

  return () => {
    subscription.unsubscribe();
  };
}

/** A hot stream with no replay — what an RxJS `Subject` is to its readers:
 * `publish` reaches every CURRENT subscriber synchronously, in order, and a
 * late subscriber sees only what comes after. Synchronous on purpose: a
 * `PubSub` read through `streamToStream` attaches each reader on a fiber, so
 * a value published in the same tick a reader subscribes would be lost
 * (slice 7 wave 1's lost-turn bug). */
export interface HotStream<T> {
  readonly stream$: CoreStream<T>;
  publish(value: T): void;
  /** A plain synchronous listener — for a reader that must see two sources
   * in exact order (the Jarvis demo's step watcher); returns its release. */
  listen(listener: (value: T) => void): () => void;
}

export function createHotStream<T>(): HotStream<T> {
  const listeners = new Set<(value: T) => void>();

  function listen(listener: (value: T) => void): () => void {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  return {
    stream$: new Observable<T>((subscriber) => {
      return listen((value: T) => {
        subscriber.next(value);
      });
    }),
    listen,
    // A listener that throws is reported and skipped, as an RxJS Subject
    // reports a throwing subscriber: the others, and later values, still
    // arrive.
    publish: (value: T) => {
      for (const listener of [...listeners]) {
        try {
          listener(value);
        } catch (error) {
          reportOutOfBand(Cause.die(error));
        }
      }
    },
  };
}

/** Hear a core stream synchronously, as an RxJS subscriber does — for a
 * machine whose state must follow a source in the same tick its value
 * arrives (Jarvis's preferences and availability). A source failure is
 * handed to `onError` and ends the listening; returns the release. */
export function listenToStream<T>(
  source: CoreStream<T>,
  listener: (value: T) => void,
  onError: (error: unknown) => void,
): () => void {
  const subscription = source.subscribe({ next: listener, error: onError });

  return () => {
    subscription.unsubscribe();
  };
}

/** A stream that completes at once without a value — an unsupported desk
 * panel's `data$` (the RxJS presenter's `EMPTY`). */
export function emptyStream<T>(): CoreStream<T> {
  return new Observable<T>((subscriber) => {
    subscriber.complete();
  });
}

/** A `FromPort` bound to a scope that is not a fold period's — a machine's
 * own. Same rule as the period-scoped one: call it once per port per scope;
 * the subscription exists from the moment it returns and the scope's close
 * releases it. */
export function fromPortIn(scope: Scope.Scope): FromPort {
  return fromPortOf(scope);
}

/** Rethrow a cause on a macrotask, outside every fiber — the Effect twin of
 * the async core's `reportAsync`, for a machine whose source failed and
 * whose ref has no error channel (slice 2 ruling 8). */
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
      // NOT `host.runtime`: an unsubscribe arriving after `dispose()` would
      // fork a fiber that dies with an unhandled defect while leaving this
      // one running — see `detached`.
      interruptFiber(fiber);
    };
  });
}

/** How a `sharedFold` producer writes its state: apply `next` to the
 * current value (`None` until the period's first write, for a seedless
 * period) and, unless the result is `Object.is`-equal to the current one,
 * keep it and hand it to every subscriber of the period before the effect
 * completes. A consequence a caller must know: an Effect-core fold CONFLATES
 * equal consecutive states (the RxJS core's `scan`/`map` do not). */
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
 * to annotate the parameter.
 *
 * `merged` is the same for a producer that folds SEVERAL ports as one
 * stream of events: prefer it to `Stream.merge` over two `fromPort` streams
 * — events keep the order the ports emitted them in, and a value costs one
 * fiber step instead of about eleven (`fromObservables`, `bridge/in.ts`). */
export interface FromPort {
  <T>(source: CoreStream<T>): Stream.Stream<T, unknown>;
  merged<E>(sources: readonly PortEvents<E>[]): Stream.Stream<E, unknown>;
}

function fromPortOf(scope: Scope.Scope): FromPort {
  function fromPort<T>(source: CoreStream<T>): Stream.Stream<T, unknown> {
    return fromObservable(source, scope);
  }

  fromPort.merged = <E>(
    sources: readonly PortEvents<E>[],
  ): Stream.Stream<E, unknown> => {
    return fromObservables(sources, scope);
  };

  return fromPort;
}

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
  /** The latest state: the seed, then whatever the producer last wrote. */
  current: Option.Option<S>;
  /** THIS period's subscribers — every write and a failure go to these and
   * no others, so a stale period's producer, still running in the
   * unsubscribe → close window, can neither write to nor error a later
   * period's subscribers. */
  subscribers: Set<Subscriber<S>>;
}

/** Two `Option`s hold the same state: both `None`, or both `Some` of
 * `Object.is`-equal values. */
function sameState<S>(a: Option.Option<S>, b: Option.Option<S>): boolean {
  if (Option.isNone(a) || Option.isNone(b)) {
    return Option.isNone(a) && Option.isNone(b);
  }

  return Object.is(a.value, b.value);
}

/** `shareReplay({ bufferSize: 1, refCount: true })` restated over a `Scope`.
 * The FIRST subscriber seeds the period and forks `run` into a scope of its
 * own — a child of the app's, so `dispose()` still ends it. Every subscriber
 * is handed the current state inside its `subscribe` call, and from then on
 * each state the producer writes, DIRECTLY: `update` calls the subscribers
 * from the producer's fiber. The LAST unsubscribe releases the period's
 * ports and closes its scope, interrupting the producer.
 *
 * Why directly, and not through a `SubscriptionRef` each subscriber follows
 * on a fiber of its own — which is how this was first written. MEASURED
 * 2026-10-04 (React client, FX screen, timing every fiber step): those
 * watcher fibers were 820 of the 2,900 scheduler tasks of the first two
 * seconds and 1,750 of 7,500 per six seconds of steady state — a quarter of
 * the core's fiber work, spent forwarding values. They also needed a latch
 * (the producer's first write waited for the first watcher to be listening)
 * and left a window in which a later subscriber missed intermediate states.
 * Called from the producer, a subscriber is registered before the producer
 * starts, so neither exists. `Stream.share` cannot be this envelope either:
 * it replays to a new subscriber on a fiber, never in the caller's tick. */
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

    // Not `host.runtime`, as in `streamToStream`: this must still work
    // after it has been disposed.
    closeScope(period.scope);
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

    const period: WarmPeriod<S> = {
      scope,
      current: seed,
      subscribers: new Set([first]),
    };
    // Assigned BEFORE `runFork`: a producer that fails at once fans that
    // failure out while this call is still on the stack, and the fan-out
    // has to find `warm` pointing at THIS period to be able to end it. That
    // is the whole of the re-entrancy guarantee — the period is published
    // before anything can run — NOT that a nested subscribe joins this
    // period: the fan-out ends the period first, so a resubscribe from a
    // subscriber's `error()` deliberately starts a fresh one.
    warm = period;

    // The seed reaches the first subscriber BEFORE the producer is forked,
    // so whatever the producer writes — even from its first synchronous
    // step — arrives after it, in order.
    if (Option.isSome(seed)) {
      first.next(seed.value);
    }

    function update(
      next: (current: Option.Option<S>) => S,
    ): Effect.Effect<void> {
      return Effect.sync(() => {
        const value = next(period.current);
        const state = Option.some(value);

        if (sameState(state, period.current)) {
          return;
        }

        period.current = state;

        // A copy: a subscriber may unsubscribe, or subscribe another, from
        // inside its `next`. A newcomer has already been handed this state
        // by its own subscribe, so it must not hear it again here.
        for (const subscriber of [...period.subscribers]) {
          subscriber.next(value);
        }
      });
    }

    const fromPort = fromPortOf(scope);

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

      if (Option.isSome(period.current)) {
        subscriber.next(period.current.value);
      }
    }

    return () => {
      period.subscribers.delete(subscriber);

      if (period.subscribers.size === 0 && fold.retain !== true) {
        endPeriod(period);
      }
    };
  });
}
