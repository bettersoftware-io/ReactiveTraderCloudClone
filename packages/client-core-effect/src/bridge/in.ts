import { Chunk, Effect, Queue, Scope, Stream, Take } from "effect";
import type { Observable } from "rxjs";

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
 * already-unsubscribed source).
 *
 * BURSTS TRAVEL WHOLE. Everything the source emits in one turn is drained
 * together and sent downstream as ONE chunk (`drainBurst` +
 * `joinConsecutiveValues` below). That is load-bearing for the UI, not a
 * tuning detail. `Stream.merge`, `mergeAll` and `flatMap` hand each CHUNK
 * from one fiber to another on its own scheduler turn, and a UI renders once
 * per turn — so a burst that enters as fifty single-value chunks (what the
 * obvious `Stream.fromQueue(queue).pipe(Stream.flattenTake)` produces: one
 * chunk per `Take`) reaches every fold with a `merge` in it, and then the
 * screen, one value per turn.
 *
 * MEASURED 2026-10-04, when this was `fromQueue` + `flattenTake`: the
 * pricing simulator replays 50 historical ticks per pair on subscribe, and
 * the nine FX tiles rendered 1,070 times in their first two seconds against
 * ~95 on the RxJS and async cores; the page was busy for 666 ms at start-up
 * against 166 ms, 4.1 s against 0.8 s under 6x CPU throttling — which is
 * what made the effect-core e2e job slow. With the burst kept whole: ~150
 * renders, 380 ms, 1.8 s. A waiting `take` is handed the burst's first value
 * alone, hence the `takeAll` that follows it. Do not simplify this back: the
 * contract cases named "…in one turn" (`collectTurns`, `@rtc/core-contract`)
 * and this file's chunk tests fail if a burst is split.
 *
 * The calling rule, stated as what to DO: call it inside a `sharedFold`'s
 * `run`, once per warm period. Never at presenter construction, never
 * hoisted, never reused across periods: the subscription exists from the
 * moment this returns, a stream that is never run leaks it and its
 * unbounded queue, and two concurrent runs of one returned stream split the
 * events between them. The calling rule is now structural: presenters reach
 * this only through a `sharedFold`'s period-scoped `fromPort`
 * (`bridge/out.ts`), which passes the period's scope; the
 * dependency-cruiser rule `effect-port-subscription-owned-by-the-bridge`
 * keeps it that way. */
export function fromObservable<T>(
  source: Observable<T>,
  scope?: Scope.Scope,
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

  // A stream that is never run never reaches its `ensuring` — so the period
  // that opened this subscription also owns it: closing the scope releases
  // it whether or not the stream ran. `unsubscribe` is idempotent. The
  // finalizer lives as long as the scope, so a caller calls this once per
  // source per scope — one per event would accumulate a subscription and a
  // finalizer per value until the scope closes.
  if (scope !== undefined) {
    Effect.runSync(
      Scope.addFinalizer(
        scope,
        Effect.sync(() => {
          subscription.unsubscribe();
        }),
      ),
    );
  }

  // One drain = everything the source emitted in one turn. A parked `take`
  // is handed the burst's FIRST value alone (the queue completes a waiting
  // taker with one element), so the rest is collected with `takeAll` once
  // this fiber resumes — by then the source's synchronous loop has finished
  // and the whole burst is queued.
  const drainBurst = Queue.take(queue).pipe(
    Effect.zipWith(Queue.takeAll(queue), (first, rest) => {
      return Chunk.prepend(rest, first);
    }),
  );

  return Stream.repeatEffectChunk(drainBurst).pipe(
    Stream.mapChunks(joinConsecutiveValues),
    Stream.flattenTake,
    Stream.ensuring(
      Effect.sync(() => {
        subscription.unsubscribe();
      }),
    ),
  );
}

/** Everything the queue held at one drain, with each run of consecutive
 * values joined into ONE `Take` — so a burst the source emitted in a single
 * turn travels downstream as a single chunk. A terminal `Take` (end or
 * failure) stays where it was, after the values that preceded it. */
function joinConsecutiveValues<T>(
  takes: Chunk.Chunk<Take.Take<T, unknown>>,
): Chunk.Chunk<Take.Take<T, unknown>> {
  const joined: Take.Take<T, unknown>[] = [];
  let values: T[] = [];

  function flushValues(): void {
    if (values.length > 0) {
      joined.push(Take.chunk(Chunk.unsafeFromArray(values)));
      values = [];
    }
  }

  for (const take of takes) {
    Take.match(take, {
      onEnd: () => {
        flushValues();
        joined.push(take);
      },
      onFailure: () => {
        flushValues();
        joined.push(take);
      },
      onSuccess: (chunk: Chunk.Chunk<T>) => {
        values.push(...chunk);
      },
    });
  }

  flushValues();
  return Chunk.unsafeFromArray(joined);
}
