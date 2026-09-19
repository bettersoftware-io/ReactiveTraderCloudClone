import { state } from "@rx-state/core";
import {
  Cause,
  Effect,
  ExecutionStrategy,
  Exit,
  Fiber,
  type ManagedRuntime,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import { filter, Observable, type Subscriber } from "rxjs";

import { reconnect$ } from "@rtc/client-core";
import type { Stream as CoreStream, StateStream } from "@rtc/core-api";

/** What the bridge needs from the app to run Effects on its behalf: the
 * runtime to run them under, and the scope every forked stream fiber is
 * attached to. `ManagedRuntime.runFork` produces ROOT fibers — disposing the
 * runtime does NOT interrupt them — so the scope is what makes the app able
 * to end them, and `composeWithBase` owns both. */
export interface EffectHost {
  readonly runtime: ManagedRuntime.ManagedRuntime<never, never>;
  readonly scope: Scope.CloseableScope;
}

/** Run an Effect Stream under each Observable subscribe as a forked fiber;
 * unsubscribe interrupts it. Typed errors are squashed to one `unknown`
 * at this boundary and nowhere else. */
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
 * current value and publish the result only if it is not `Object.is`-equal
 * to the current one, and only while the warm period that forked this
 * producer is still the current one. Two facts make both guards necessary:
 * a `SubscriptionRef` re-publishes an equal `set` (measured on 3.22.2),
 * which would hand every subscriber the seed twice; and a scope closes on a
 * fiber, so a producer can outlive its period by a tick. A consequence a
 * caller must know: an Effect-core fold CONFLATES equal consecutive states
 * (the RxJS core's `scan`/`map` do not). */
export type FoldUpdate<S> = (next: (current: S) => S) => Effect.Effect<void>;

export interface SharedFold<S> {
  /** The value a warm period starts from — read on EVERY first subscribe, so
   * a port mirror seeds from the port's current value (`peek`) and a pure
   * fold from its constant initial. */
  readonly seed: () => S;
  /** The producer: runs for the whole warm period, writing through
   * `update`; interrupted when the last subscriber leaves. Its failure is
   * fanned out to every subscriber as an Observable error. */
  readonly run: (update: FoldUpdate<S>) => Effect.Effect<void, unknown>;
}

interface WarmPeriod {
  scope: Scope.CloseableScope;
  subscribers: number;
}

/** `shareReplay({ bufferSize: 1, refCount: true })` restated over a
 * `SubscriptionRef` and a `Scope`. The FIRST subscriber seeds the ref and
 * forks `run` into a scope of its own — a child of the app's, so
 * `dispose()` still ends it; every subscriber reads the ref's current value
 * synchronously (`refToStateStream`: the warmth guarantee) and then follows
 * `ref.changes` on the scheduler; the LAST unsubscribe closes the scope,
 * interrupting the producer. `Stream.share` cannot be this envelope: it
 * replays to a new subscriber on a fiber, never in the caller's tick. */
export function sharedFold<S>(
  host: EffectHost,
  fold: SharedFold<S>,
): CoreStream<S> {
  // `SubscriptionRef.make` needs a concrete `S` synchronously, before any
  // subscriber exists — but `fold.seed()` must be read at ACTUAL
  // first-subscribe time (freshness; see `SharedFold.seed`), not now, and
  // exactly once per warm period. This placeholder is overwritten by
  // `startWarmPeriod` before any subscriber ever reads it, so it is never
  // observed — and `fold.seed()` is never called on its account.
  const ref = host.runtime.runSync(
    SubscriptionRef.make<S>(undefined as unknown as S),
  );
  const changes = refToStateStream(host, ref);
  const subscribers = new Set<Subscriber<S>>();
  let warm: WarmPeriod | null = null;
  let generation = 0;

  function failEverySubscriber(cause: Cause.Cause<unknown>): void {
    if (Cause.isInterruptedOnly(cause)) {
      return;
    }

    for (const subscriber of [...subscribers]) {
      subscriber.error(Cause.squash(cause));
    }
  }

  function startWarmPeriod(): WarmPeriod {
    generation += 1;
    const mine = generation;
    const scope = host.runtime.runSync(
      Scope.fork(host.scope, ExecutionStrategy.sequential),
    );
    host.runtime.runSync(SubscriptionRef.set(ref, fold.seed()));

    function update(next: (current: S) => S): Effect.Effect<void> {
      return Effect.suspend(() => {
        if (mine !== generation) {
          return Effect.void;
        }

        return SubscriptionRef.get(ref).pipe(
          Effect.flatMap((current) => {
            const value = next(current);
            return Object.is(value, current)
              ? Effect.void
              : SubscriptionRef.set(ref, value);
          }),
        );
      });
    }

    host.runtime.runFork(
      fold.run(update).pipe(
        Effect.catchAllCause((cause) => {
          return Effect.sync(() => {
            failEverySubscriber(cause);
          });
        }),
      ),
      { scope },
    );

    return { scope, subscribers: 0 };
  }

  return new Observable<S>((subscriber) => {
    // Registered BEFORE the warm period starts: `runFork` runs the producer
    // synchronously up to its first suspension, so a producer that fails at
    // once (`Effect.fail`) fans out during `startWarmPeriod` — to an empty
    // set, if this subscriber were added afterwards.
    subscribers.add(subscriber);

    if (warm === null) {
      warm = startWarmPeriod();
    }

    const period = warm;
    period.subscribers += 1;
    const inner = changes.subscribe(subscriber);

    return () => {
      inner.unsubscribe();
      subscribers.delete(subscriber);
      period.subscribers -= 1;

      if (period.subscribers === 0 && warm === period) {
        warm = null;
        // The global runtime, as in `streamToStream`: this must still work
        // after `host.runtime` has been disposed.
        Effect.runFork(Scope.close(period.scope, Exit.void));
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
