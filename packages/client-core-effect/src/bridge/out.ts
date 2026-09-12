import { state } from "@rx-state/core";
import {
  Cause,
  Effect,
  Fiber,
  type ManagedRuntime,
  Stream,
  SubscriptionRef,
} from "effect";
import { Observable } from "rxjs";

import type { Stream as CoreStream, StateStream } from "@rtc/core-api";

type Runtime = ManagedRuntime.ManagedRuntime<never, never>;

/** Run an Effect Stream under each Observable subscribe as a forked fiber;
 * unsubscribe interrupts it. Typed errors are squashed to one `unknown`
 * at this boundary and nowhere else. */
export function streamToStream<T, E>(
  runtime: Runtime,
  stream: Stream.Stream<T, E>,
): CoreStream<T> {
  return new Observable<T>((subscriber) => {
    const fiber = runtime.runFork(
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
    );

    return () => {
      runtime.runFork(Fiber.interrupt(fiber));
    };
  });
}

/** A SubscriptionRef as a warm StateStream: the seed is read synchronously
 * with runSync (the warmth guarantee), then `changes` is bridged.
 *
 * `changes` REPLAYS the current value to each subscriber, so it is dropped:
 * `state(…, seed)` already emits the seed, and without the drop every
 * subscriber would see the current value twice. */
export function refToStateStream<S>(
  runtime: Runtime,
  ref: SubscriptionRef.SubscriptionRef<S>,
): StateStream<S> {
  const current = runtime.runSync(SubscriptionRef.get(ref));
  return state(streamToStream(runtime, Stream.drop(ref.changes, 1)), current);
}
