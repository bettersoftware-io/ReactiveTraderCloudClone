import type { Stream } from "@rtc/core-api";

import type { Collected } from "#/harness/collect";

/** `collect`, plus how many separate TURNS the emissions arrived in. */
export interface CollectedTurns<T> extends Collected<T> {
  /** The number of distinct turns that delivered at least one value so far. */
  turnCount(): number;
}

/** Subscribe, keep every emission, and count the turns they arrive in.
 *
 * A turn here is a stretch of synchronous execution: it ends at the next
 * microtask checkpoint. That is the boundary a UI batches on — React and
 * Solid both coalesce every store update made within one turn into a single
 * re-render — so "N values in one turn" costs one render and "N values in N
 * turns" costs N. The simulator replays 50 historical ticks per pair on
 * subscribe; a core that spread that burst over 50 turns made nine FX tiles
 * render 1,070 times at start-up instead of about 100 (measured 2026-10-04;
 * see `tests/README.md` § Dev-server payload and the bridge note in
 * `@rtc/client-core-effect`'s `bridge/in.ts`).
 *
 * Counted with a microtask per turn: the first emission of a turn queues one
 * microtask that advances the turn number, so every later emission that
 * lands before that checkpoint shares the number. */
export function collectTurns<T>(stream: Stream<T>): CollectedTurns<T> {
  const values: T[] = [];
  const errors: unknown[] = [];
  const turnsSeen = new Set<number>();
  let turn = 0;
  let advanceQueued = false;

  const subscription = stream.subscribe({
    next: (value: T) => {
      values.push(value);
      turnsSeen.add(turn);

      if (!advanceQueued) {
        advanceQueued = true;
        queueMicrotask(() => {
          turn += 1;
          advanceQueued = false;
        });
      }
    },
    error: (error: unknown) => {
      errors.push(error);
    },
  });

  return {
    values,
    errors,
    turnCount: () => {
      return turnsSeen.size;
    },
    unsubscribe: () => {
      subscription.unsubscribe();
    },
  };
}
