import { type StateObservable, state } from "@rx-state/core";
import { timer } from "rxjs";
import { map, takeWhile } from "rxjs/operators";

import type { ReadOnlyMachine } from "./machine";

/** How often the credit-RFQ countdown ticks. Presenter-local — a UI cadence
 * concern, not a domain constant. Mirrors RfqTileMachine's COUNTDOWN_INTERVAL_MS. */
const COUNTDOWN_INTERVAL_MS = 100;

/** Live-countdown machine for an open credit RFQ (rtc-original CreditRfqTimer.tsx).
 * State is remainingMs, ticking every COUNTDOWN_INTERVAL_MS, clamped at 0.
 * Deterministic under fake timers because remaining is derived from the timer
 * tick index, not Date.now() — same idiom as RfqTileMachine receivedFlow (line 89-103). */
export function createRfqCountdownMachine(
  creationTimestamp: number,
  totalMs: number,
): ReadOnlyMachine<number> {
  const elapsed = Date.now() - creationTimestamp;
  const initialRemaining = Math.max(0, totalMs - elapsed);

  // Tick every COUNTDOWN_INTERVAL_MS, derive remaining from tick index.
  // takeWhile(inclusive: false) stops the stream once remaining reaches 0.
  const stream$ = timer(0, COUNTDOWN_INTERVAL_MS).pipe(
    map((i): number => {
      return Math.max(0, initialRemaining - i * COUNTDOWN_INTERVAL_MS);
    }),
    takeWhile((ms) => {
      return ms > 0;
    }, true), // inclusive: emit the 0 tick so the display shows "0s"
  );

  const state$: StateObservable<number> = state(stream$, initialRemaining);

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
