import type { Stream } from "@rtc/core-api";

/** What `collect` hands back: the live emission log, the live error log, and
 * its own teardown. */
export interface Collected<T> {
  readonly values: T[];
  /** Every `error` notification, in order. A stream that errors lands here as
   * a located assertion (`expect(c.errors).toEqual([])`) instead of an
   * unhandled rxjs error thrown from a timer. */
  readonly errors: unknown[];
  unsubscribe(): void;
}

/** Subscribe and keep every emission. `values` is live: read it after
 * driving the ports and awaiting `settle()`. Synchronous emissions on
 * subscribe land before `collect` returns — that is how the suites assert
 * replay-current behaviour. */
export function collect<T>(stream: Stream<T>): Collected<T> {
  const values: T[] = [];
  const errors: unknown[] = [];
  const subscription = stream.subscribe({
    next: (value: T) => {
      values.push(value);
    },
    error: (error: unknown) => {
      errors.push(error);
    },
  });

  return {
    values,
    errors,
    unsubscribe: () => {
      subscription.unsubscribe();
    },
  };
}
