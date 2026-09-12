import { state } from "@rx-state/core";
import {
  Cause,
  Effect,
  Fiber,
  type ManagedRuntime,
  type Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import { filter, Observable } from "rxjs";

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
  // is never observed: `StateObservable` emits its default only when the
  // source has NOT already emitted by the end of `source$.subscribe(...)`,
  // and `perSubscription` always emits synchronously there. The cold → warm
  // test pins that, by seeing the ref's latest value rather than this one.
  return state(perSubscription, readCurrent());
}
