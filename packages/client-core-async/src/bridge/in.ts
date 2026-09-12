import { firstValueFrom, type Observable } from "rxjs";

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
 * consuming `for await` simply exits, which is what `spawn` expects. */
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

  // Named for its effect, not its trigger (rtc/name-functions-by-effect):
  // it ends the iteration and wakes the loop so the `for await` can exit.
  function endIteration(): void {
    inbox.done = true;
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
