import { Effect, Queue, Stream, Take } from "effect";
import { type Observable, type Subscription, take } from "rxjs";

/** Push an Observable into an Effect Stream, subscribing SYNCHRONOUSLY, as a
 * side effect of calling `fromObservable` itself — not lazily, on first
 * pull, the way the obvious `Stream.asyncPush`/`Stream.asyncScoped` shapes
 * do. Values (and completion/error) are still delivered on the scheduler,
 * same as before; only the act of subscribing moved earlier.
 *
 * MEASURED on effect 3.22.2, with `s$.observed` as the probe: under
 * `runtime.runFork`, a plain `Effect` (`Effect.sync`, `Effect.async`,
 * `Effect.gen`) runs synchronously up to its first suspension — but
 * `Stream.runForEach(stream, f)` does NOT extend that guarantee to
 * anything inside `stream`, for ANY stream shape. Every construction tried
 * deferred by at least one microtask past `runFork`'s return: the original
 * `Stream.asyncPush`, `Stream.asyncScoped`, `Stream.unwrapScoped` (a `Queue`
 * built inside a scoped `Effect.gen`), `Stream.unwrap(Effect.sync(...))` —
 * even the pure, Effect-free `Stream.make(1).pipe(Stream.tap(...))`, whose
 * `tap` never runs synchronously either. `Stream.runForEach`'s own
 * channel-loop scheduling is what introduces the delay, unconditionally —
 * not `fromObservable`'s previous implementation, and not fixable by
 * changing what the stream is built from. (Do not "simplify" this back to
 * `asyncPush`: it measurably reintroduces the bug — see `sharedFold`'s and
 * this file's "…synchronously…" tests.)
 *
 * So this subscribes from PLAIN, synchronous code — the function body,
 * called as an ordinary expression before any `Effect`/`Stream` machinery
 * runs — buffering into a `Queue` that the returned stream merely drains.
 * `sharedFold`'s producers rely on exactly this: `fold.run(update)` (which
 * calls `fromObservable(...)`) is evaluated to build the Effect handed to
 * `runFork`, so the subscribe below has already happened by the time
 * `runFork` is even called, not just by the time it returns.
 *
 * One consequence: this subscribes once per CALL, not once per independent
 * `Stream.runForEach` run of the resulting value — a caller that builds one
 * `fromObservable(source)` stream and drains it to completion more than
 * once will only see the first run's subscription (the second sees an
 * already-unsubscribed source). Every current caller calls `fromObservable`
 * fresh inside the effect it hands to `sharedFold`'s `run`, so it gets a
 * fresh subscription on every warm period; only a caller that hoists the
 * call OUTSIDE `run` and reuses the value across periods would see this. */
export function fromObservable<T>(
  source: Observable<T>,
): Stream.Stream<T, unknown> {
  const queue = Effect.runSync(Queue.unbounded<Take.Take<T, unknown>>());
  const subscription = source.subscribe({
    next: (value: T) => {
      Queue.unsafeOffer(queue, Take.of(value));
    },
    error: (error: unknown) => {
      Queue.unsafeOffer(queue, Take.fail(error));
    },
    complete: () => {
      Queue.unsafeOffer(queue, Take.end);
    },
  });

  return Stream.fromQueue(queue).pipe(
    Stream.flattenTake,
    Stream.ensuring(
      Effect.sync(() => {
        subscription.unsubscribe();
      }),
    ),
  );
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

/** The current value of a replay-current Observable, read synchronously —
 * the seed a `sharedFold` starts a warm period from, and what `cycle()`
 * advances from. A source that does not emit during `subscribe` yields
 * `fallback`; the subscription is released before this returns. */
export function peek<T>(source: Observable<T>, fallback: T): T {
  let value = fallback;
  source
    .pipe(take(1))
    .subscribe((current) => {
      value = current;
    })
    .unsubscribe();
  return value;
}
