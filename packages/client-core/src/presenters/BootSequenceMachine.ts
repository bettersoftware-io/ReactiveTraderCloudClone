import { type StateObservable, state } from "@rx-state/core";
import { merge, Subject, timer } from "rxjs";
import { filter, map, take, takeUntil, takeWhile } from "rxjs/operators";

import type { BootVariant } from "@rtc/domain";

import type { Machine } from "./machine";

export type { BootVariant };
export const BOOT_VARIANTS: readonly BootVariant[] = [
  "core",
  "laser",
  "docking",
];
export const BOOT_DURATION_MS = 4200;
const BOOT_TICK_MS = 90;

export interface BootSequenceState {
  readonly variant: BootVariant;
  readonly progress: number;
  readonly done: boolean;
}

export interface BootSequenceIntents {
  skip: () => void;
}

export interface BootSequenceDeps {
  /** Current persisted cycle index → the variant for this run. Read once at construction. */
  readonly variant: BootVariant;
  /** Advance the persisted cycle pointer to the next variant (preferences seam; NO localStorage here). */
  readonly advance: (next: BootVariant) => void;
  /** When the ramp completes (or skip fires), notify the shell to cross-fade. */
  readonly onDone: () => void;
}

const TICKS = Math.ceil(BOOT_DURATION_MS / BOOT_TICK_MS);

export function createBootSequenceMachine(
  deps: BootSequenceDeps,
): Machine<BootSequenceState, BootSequenceIntents> {
  const variant = deps.variant;
  // Advance the persisted cycle pointer immediately, like the prototype does at
  // boot start (Reactive Trader.dc.html:846) — next run gets the next variant.
  const nextIdx = (BOOT_VARIANTS.indexOf(variant) + 1) % BOOT_VARIANTS.length;
  deps.advance(BOOT_VARIANTS[nextIdx]);

  const skip$ = new Subject<void>();
  const initial: BootSequenceState = { variant, progress: 0, done: false };

  // Progress derived from tick index i: pct = min(100, round(i / TICKS * 100)).
  // Deterministic under fake timers — no Date.now() in the math.
  const ramp$ = timer(0, BOOT_TICK_MS).pipe(
    map((i): BootSequenceState => {
      const progress = Math.min(100, Math.round((i / TICKS) * 100));
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
