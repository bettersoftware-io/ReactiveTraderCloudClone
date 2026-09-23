import { relayTopic } from "#/kernel/relayTopic";
import { createTopic, type Topic } from "#/kernel/topic";

/** A topic folding every value of `source` into an accumulator — the RxJS
 * core's `scan(step, initial)` + `startWith(initial)` + `shareReplay(1)`:
 * each producer run publishes `initial` synchronously (the first subscriber
 * paints the seed on the first frame), then one folded value per source
 * value. Replay-current, so a late subscriber gets the latest accumulator
 * and never the seed again. `source` is subscribed ONCE per run however many
 * subscribe here. With `retainUntil` the run — and the accumulator — survive
 * zero subscribers until that signal aborts (`warmReplay()`); a later run
 * starts again from `initial`. */
export function foldTopic<T, S>(
  source: Topic<T>,
  initial: S,
  step: (accumulator: S, value: T) => S,
  retainUntil?: AbortSignal,
): Topic<S> {
  return createTopic<S>(
    (signal, publish) => {
      let accumulator = initial;
      publish(accumulator);

      return relayTopic(source, signal, (value) => {
        accumulator = step(accumulator, value);
        publish(accumulator);
      });
    },
    { replay: true, retainUntil },
  );
}
