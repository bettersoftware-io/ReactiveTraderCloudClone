/**
 * The narrator's decision rules, free of any stream library: which surviving
 * anomaly may speak (the cooldown and the per-session cap) and what it says.
 * The RxJS `createNarratorMachine` is a shell over it (the tick merge and
 * the detector pipeline), and the alternative application cores import it
 * rather than re-implementing it (pluggable-core slice 7 wave 2, ruling 2).
 */
import {
  type AnomalyEvent,
  JARVIS_NARRATION_PREFIX,
  MAX_NARRATIONS_PER_SESSION,
  NARRATION_COOLDOWN_MS,
} from "@rtc/domain";

/** The pinned narration copy (T7 review ruling): the vol channel detects a
 * large single-tick MOVE against the window's own trailing σ, not a rise in
 * "volatility" as a separately-tracked quantity — the copy must say
 * "moved", never "volatility jumped". */
export function formatNarrationPrompt(event: AnomalyEvent): string {
  const verb = event.kind === "spreadWidening" ? "spread widened" : "moved";
  return `${JARVIS_NARRATION_PREFIX}${event.symbol} ${verb} ${event.sigma.toFixed(1)}σ over the last window.`;
}

/** The cooldown/session-cap fold's accumulator. `event`/`shouldNarrate`
 * describe the MOST RECENT anomaly this fold has seen — a fresh pair every
 * step, never stale from a prior one. `event` is `null` only in the fold's
 * seed, before any anomaly has arrived. */
export interface NarratorGateState {
  readonly count: number;
  readonly lastAt: number | null;
  readonly event: AnomalyEvent | null;
  readonly shouldNarrate: boolean;
}

export const NARRATOR_INITIAL_GATE: NarratorGateState = {
  count: 0,
  lastAt: null,
  event: null,
  shouldNarrate: false,
};

/** Decides whether `event` — a surviving anomaly (already past the
 * preference gate) arriving at virtual/wall time `now` — actually gets
 * narrated: dropped once `MAX_NARRATIONS_PER_SESSION` has been reached
 * (forever, no reset), dropped while still inside `NARRATION_COOLDOWN_MS` of
 * the last successful narration, else admitted (and the gate's own
 * `count`/`lastAt` advance). */
export function admitAnomaly(
  state: NarratorGateState,
  event: AnomalyEvent,
  now: number,
): NarratorGateState {
  if (state.count >= MAX_NARRATIONS_PER_SESSION) {
    return { ...state, event, shouldNarrate: false };
  }

  if (state.lastAt !== null && now - state.lastAt < NARRATION_COOLDOWN_MS) {
    return { ...state, event, shouldNarrate: false };
  }

  return { count: state.count + 1, lastAt: now, event, shouldNarrate: true };
}

/** `NarratorGateState` narrowed to the fold steps that actually admitted an anomaly
 * — see `isAdmittedGate`'s doc. */
type AdmittedGateState = NarratorGateState & { readonly event: AnomalyEvent };

/** Narrows a fold step to the ones that actually admitted an anomaly —
 * `shouldNarrate: true` is only ever set alongside a fresh (non-null)
 * `event` in `admitAnomaly`'s final branch, so narrowing on the flag alone
 * is sound. */
export function isAdmittedGate(
  state: NarratorGateState,
): state is AdmittedGateState {
  return state.shouldNarrate;
}
