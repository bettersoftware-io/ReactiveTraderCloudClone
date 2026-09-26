import { type StateObservable, state } from "@rx-state/core";
import { EMPTY, timer } from "rxjs";
import { distinctUntilChanged, map, startWith } from "rxjs/operators";

import type { ReadOnlyMachine } from "@rtc/core-logic";
import { BLOTTER_ROW_HIGHLIGHT_MS } from "@rtc/domain";

/** How long a newly-arrived blotter row stays highlighted, relocated verbatim
 * from the old BlotterRow `setTimeout(…, 3000)`. Now the domain's
 * `BLOTTER_ROW_HIGHLIGHT_MS`; kept under this name for `BlotterRow.tsx` in
 * both web clients and the React contract harness. */
export const HIGHLIGHT_MS: number = BLOTTER_ROW_HIGHLIGHT_MS;

/** Transient new-row highlight, relocated out of the old BlotterRow useEffect/
 * setTimeout. It has NO intents — it's a pure read-only derivation over a single
 * boolean captured at mount.
 *
 * `isNew` is captured at construction time, which is faithful: rows are keyed by
 * trade id in FxBlotter (`key={trade.tradeId}`) and `isNew` is computed once per
 * trades snapshot, so a given row instance's `isNew` never flips while mounted —
 * exactly the precondition the old `useEffect([isNew])` relied on.
 *
 * The rule (reproduced exactly from the old hook): a NEW row shows the highlight
 * immediately (true) and clears it after HIGHLIGHT_MS (false); a non-new row is
 * always false. */
export function createRowHighlightMachine(
  isNew: boolean,
): ReadOnlyMachine<boolean> {
  // For a new row: emit `false` once HIGHLIGHT_MS has elapsed. The synchronous
  // `true` seed is supplied by startWith below. For a non-new row: nothing ever
  // emits after the seed, so it stays `false` forever.
  const stream$ = (
    isNew
      ? timer(HIGHLIGHT_MS).pipe(
          map(() => {
            return false;
          }),
        )
      : EMPTY
  ).pipe(
    // Seed the synchronous initial value here (not as state()'s separate default)
    // so state() doesn't replay its default AND the stream's first value. Same
    // idiom and precondition as StaleFlagMachine: needed because the default can
    // be structurally equal to the first emission (a non-new row seeds `false`
    // and never emits again; distinctUntilChanged collapses the pair).
    startWith(isNew),
    distinctUntilChanged(),
  );

  const state$: StateObservable<boolean> = state(stream$);

  // Keep state$ warm so it carries its default before useMachine first renders.
  const warm = state$.subscribe();

  return {
    state$,
    intents: {},
    dispose: () => {
      warm.unsubscribe();
    },
  };
}
