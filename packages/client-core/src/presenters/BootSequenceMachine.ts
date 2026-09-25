import { type StateObservable, state } from "@rx-state/core";
import { merge, Subject, timer } from "rxjs";
import { filter, map, take, takeUntil, takeWhile } from "rxjs/operators";

import type { BootSequenceIntents, BootSequenceState } from "@rtc/core-api";
import type { Machine } from "@rtc/core-logic";
import { bootProgress, nextBootVariant } from "@rtc/core-logic";
import {
  BOOT_TICK_MS,
  BOOT_VARIANTS,
  type BootVariant,
  BOOT_DURATION_MS as DOMAIN_BOOT_DURATION_MS,
} from "@rtc/domain";

export type { BootVariant };
// Cycle order lives in domain (PROTO _startBoot v3 list: core → laser →
// docking → hologram → geo → layers → jarvis → topo); re-exported for
// existing consumers.
export { BOOT_VARIANTS };
/** Re-exported for existing importers; the value lives in `@rtc/domain`. */
export const BOOT_DURATION_MS: number = DOMAIN_BOOT_DURATION_MS;

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { BootSequenceIntents, BootSequenceState };

export interface BootSequenceDeps {
  /** Current persisted cycle index → the variant for this run. Read once at construction. */
  readonly variant: BootVariant;
  /** Advance the persisted cycle pointer to the next variant (preferences seam; NO localStorage here). */
  readonly advance: (next: BootVariant) => void;
  /** When the ramp completes (or skip fires), notify the shell to cross-fade. */
  readonly onDone: () => void;
}

export function createBootSequenceMachine(
  deps: BootSequenceDeps,
): Machine<BootSequenceState, BootSequenceIntents> {
  const variant = deps.variant;
  // Advance the persisted cycle pointer immediately, like the prototype does at
  // boot start (Reactive Trader.dc.html:846) — next run gets the next variant.
  deps.advance(nextBootVariant(variant));

  const skip$ = new Subject<void>();
  const initial: BootSequenceState = { variant, progress: 0, done: false };

  // Progress derived from tick index i (`bootProgress`, shared with the sibling cores).
  // Deterministic under fake timers — no Date.now() in the math.
  const ramp$ = timer(0, BOOT_TICK_MS).pipe(
    map((i): BootSequenceState => {
      const progress = bootProgress(i);
      return { variant, progress, done: progress >= 100 };
    }),
    takeWhile((s) => {
      return !s.done;
    }, true), // inclusive: emit the done:true tick, then complete
  );

  const skipped$ = skip$.pipe(
    map((): BootSequenceState => {
      return { variant, progress: 100, done: true };
    }),
  );

  // The first of (ramp completion | skip) wins; takeUntil(skip$) cuts the ramp.
  const stream$ = merge(ramp$.pipe(takeUntil(skip$)), skipped$);

  const state$: StateObservable<BootSequenceState> = state(stream$, initial);

  // onDone fires exactly once when a done:true state lands.
  const doneSub = state$
    .pipe(
      filter((s) => {
        return s.done;
      }),
      take(1),
    )
    .subscribe(() => {
      deps.onDone();
    });
  const warm = state$.subscribe();

  return {
    state$,
    intents: {
      skip: () => {
        skip$.next();
      },
    },
    dispose: () => {
      skip$.complete();
      doneSub.unsubscribe();
      warm.unsubscribe();
    },
  };
}
