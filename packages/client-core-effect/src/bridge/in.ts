import { Effect, Stream } from "effect";
import type { Observable, Subscription } from "rxjs";

/** Push an Observable into an Effect Stream. The subscription is acquired
 * when the stream starts and released by the scope finaliser when the
 * consumer stops, completes, or is interrupted. Errors on the Observable
 * fail the stream with the raw error. */
export function fromObservable<T>(
  source: Observable<T>,
): Stream.Stream<T, unknown> {
  return Stream.asyncPush<T, unknown>((emit) => {
    return Effect.acquireRelease(
      Effect.sync(() => {
        return source.subscribe({
          next: (value: T) => {
            emit.single(value);
          },
          error: (error: unknown) => {
            emit.fail(error);
          },
          complete: () => {
            emit.end();
          },
        });
      }),
      (subscription) => {
        return Effect.sync(() => {
          subscription.unsubscribe();
        });
      },
    );
  });
}

/** One-shot RPC shape: the first value of an Observable port method.
 *
 * A synchronous source (`of(…)`) calls back DURING `subscribe`, before the
 * `subscription` binding exists and with more emissions still to come — so
 * the handlers route through `endSubscription`, which tolerates the
 * not-yet-assigned holder, and `settled` keeps the later `next`/`complete`
 * from resuming an already-resumed fiber. */
export function rpc<T>(source: Observable<T>): Effect.Effect<T, unknown> {
  return Effect.async<T, unknown>((resume) => {
    let subscription: Subscription | undefined;
    let settled = false;

    function endSubscription(): void {
      settled = true;
      subscription?.unsubscribe();
    }

    subscription = source.subscribe({
      next: (value: T) => {
        if (!settled) {
          endSubscription();
          resume(Effect.succeed(value));
        }
      },
      error: (error: unknown) => {
        if (!settled) {
          endSubscription();
          resume(Effect.fail(error));
        }
      },
      complete: () => {
        if (!settled) {
          endSubscription();
          resume(
            Effect.fail(new Error("rpc: source completed without a value")),
          );
        }
      },
    });

    // A synchronous source settled inside `subscribe` above, when the holder
    // was still undefined — so its unsubscribe has to happen here instead.
    if (settled) {
      subscription.unsubscribe();
    }

    return Effect.sync(() => {
      endSubscription();
    });
  });
}
