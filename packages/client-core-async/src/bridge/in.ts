import { firstValueFrom, type Observable, take } from "rxjs";

import { createTopic, type Topic } from "#/kernel/topic";

/** A source error, boxed so `null` reads as "no error" rather than being
 * confusable with an error value of `null`. */
interface IterateFailure {
  error: unknown;
}

/** The state `iterate`'s loop shares with its subscriber callbacks. */
interface IterateInbox {
  done: boolean;
  failure: IterateFailure | null;
}

/** One-shot RPC shape: the first value of an Observable port method. */
export function once<T>(source: Observable<T>): Promise<T> {
  return firstValueFrom(source);
}

/** Pull an Observable as an AsyncIterable with an unbounded queue. Ends on
 * completion, throws on error, and stops (without throwing) on abort — the
 * consuming `for await` simply exits, which is what `spawn` expects.
 *
 * Abort DROPS whatever is still queued, by design: a consumer that aborted is
 * going away and does not want stragglers. There is exactly one mechanism for
 * that — the `while (!signal.aborted)` guard below; the abort listener only
 * has to WAKE a loop parked on `wake`, never to set state of its own. */
export async function* iterate<T>(
  source: Observable<T>,
  signal: AbortSignal,
): AsyncIterable<T> {
  const queue: T[] = [];
  // `done` and `failure` are written ONLY from the subscriber callbacks and
  // the abort listener, and TypeScript's control-flow analysis ignores
  // assignments made inside a nested function — read as plain `let`s they
  // narrow to `false` / `null` in the loop below (TS2339: 'error' does not
  // exist on type 'never'). Holding them on one mutable box keeps the reads
  // honest; the runtime behaviour is unchanged.
  const inbox: IterateInbox = { done: false, failure: null };
  let wake: (() => void) | null = null;

  function notify(): void {
    wake?.();
    wake = null;
  }

  const subscription = source.subscribe({
    next: (value: T) => {
      queue.push(value);
      notify();
    },
    error: (error: unknown) => {
      inbox.failure = { error };
      notify();
    },
    complete: () => {
      inbox.done = true;
      notify();
    },
  });

  // Named for its effect, not its trigger (rtc/name-functions-by-effect).
  // It only wakes the loop: `signal.aborted` is already true by the time an
  // abort listener runs, so the `while` guard does the ending — and setting
  // `inbox.done` here would be a dead write claiming a second, drain-shaped
  // mechanism that does not exist.
  function endIteration(): void {
    notify();
  }

  signal.addEventListener("abort", endIteration, { once: true });

  try {
    while (!signal.aborted) {
      if (queue.length > 0) {
        yield queue.shift() as T;
        continue;
      }

      if (inbox.failure !== null) {
        throw inbox.failure.error;
      }

      if (inbox.done) {
        return;
      }

      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    signal.removeEventListener("abort", endIteration);
    subscription.unsubscribe();
  }
}

/** Push an Observable into a callback, synchronously per emission, until
 * `signal` aborts. Resolves on abort or on source completion, rejects on a
 * source error. The synchronous twin of `iterate`: a replay-current port
 * (BehaviorSubject-backed) emits DURING `subscribe`, and `relay` hands that
 * emission on in the same tick — the warmth a `for await` cannot give, since
 * it resumes a microtask later. Use it for hot ports a Topic mirrors; keep
 * `iterate` for sources a consumer wants to pull at its own pace. */
export function relay<T>(
  source: Observable<T>,
  signal: AbortSignal,
  next: (value: T) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const subscription = source.subscribe({
      next,
      error: reject,
      complete: resolve,
    });

    signal.addEventListener(
      "abort",
      () => {
        subscription.unsubscribe();
        resolve();
      },
      { once: true },
    );
  });
}

/** The current value of a replay-current Observable, read synchronously —
 * what `cycle()` needs (advance from the TRUE stored value, never a stale
 * closure). A source that does not emit during `subscribe` yields
 * `fallback`; the subscription is released before this returns, so nothing
 * is left warm. A source that ERRORS synchronously during `subscribe`
 * rethrows out of `peek` (and so out of `cycle()`); only a non-emitting
 * source yields `fallback`. */
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

/** A hot port Observable as a replay-1, refCounted Topic: the port is
 * subscribed on the topic's first subscriber and released on its last — the
 * RxJS core's `port$().pipe(shareReplay({ bufferSize: 1, refCount: true }))`,
 * as a Topic whose whole producer is one `relay`. */
export function topicFromObservable<T>(source: Observable<T>): Topic<T> {
  return createTopic<T>(
    (signal, publish) => {
      return relay(source, signal, publish);
    },
    { replay: true },
  );
}
