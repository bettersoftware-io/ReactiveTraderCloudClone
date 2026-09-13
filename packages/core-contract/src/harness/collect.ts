import type { Stream } from "@rtc/core-api";

/** What `collect` hands back: the live emission log plus its own teardown. */
export interface Collected<T> {
  readonly values: T[];
  unsubscribe(): void;
}

/** Subscribe and keep every emission. `values` is live: read it after
 * driving the ports or advancing fake timers. Synchronous emissions on
 * subscribe land before `collect` returns — that is how the suites assert
 * replay-current behaviour. */
export function collect<T>(stream: Stream<T>): Collected<T> {
  const values: T[] = [];
  const subscription = stream.subscribe((value) => {
    values.push(value);
  });

  return {
    values,
    unsubscribe: () => {
      subscription.unsubscribe();
    },
  };
}
