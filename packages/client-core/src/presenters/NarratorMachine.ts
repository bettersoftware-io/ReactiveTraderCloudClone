import { asyncScheduler, EMPTY, merge, type Observable } from "rxjs";
import {
  catchError,
  filter,
  map,
  scan,
  switchMap,
  withLatestFrom,
} from "rxjs/operators";

import type { NarratorDeps, NarratorHandle } from "@rtc/core-api";
import {
  type AnomalyEvent,
  type CurrencyPair,
  detectAnomalies,
  type PriceTick,
} from "@rtc/domain";

import { JARVIS_NARRATION_PREFIX } from "./JarvisMachine.js";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { NarratorDeps, NarratorHandle };

/** How long a successful narration silences the channel — measured on
 * `NarratorDeps.scheduler` (`scheduler.now()`), NEVER `Date.now()` directly,
 * so the gate is deterministic under a `TestScheduler`'s virtual time in
 * tests and still correct in production (the default scheduler's `now()`
 * IS `Date.now()` — see `deps.scheduler`'s doc). */
export const NARRATION_COOLDOWN_MS = 300_000;

/** Hard per-session cap: the 5th surviving anomaly (and every one after it)
 * is dropped forever, regardless of how long it has been since the last
 * narration. Session-lifetime — there is no reset, matching this machine's
 * own session-lifetime composition-root lifecycle (mirrors
 * `JarvisPanelsMachine`/`JarvisDriverMachine`: built once, never
 * re-composed per consumer). */
export const MAX_NARRATIONS_PER_SESSION = 4;

/** The pinned narration copy (T7 review ruling): the vol channel detects a
 * large single-tick MOVE against the window's own trailing σ, not a rise in
 * "volatility" as a separately-tracked quantity — the copy must say
 * "moved", never "volatility jumped". */
function formatNarrationPrompt(event: AnomalyEvent): string {
  const verb = event.kind === "spreadWidening" ? "spread widened" : "moved";
  return `${JARVIS_NARRATION_PREFIX}${event.symbol} ${verb} ${event.sigma.toFixed(1)}σ over the last window.`;
}

/** Merges `pairs`' live tick streams (via the injected, shared `priceFor`)
 * into one — the MERGE counterpart of `composePanelStream.ts`'s
 * `fxTicksFrame$` (which `combineLatest`s instead: a panel wants the latest
 * cross-symbol snapshot, this detector wants every individual tick as its
 * own scan step). An empty roster (nothing loaded yet) yields an observable
 * that immediately completes — `switchMap` below simply waits for the next
 * `pairs$` emission, rather than erroring. */
function mergedTicks$(
  pairs: readonly CurrencyPair[],
  priceFor: (pair: CurrencyPair) => Observable<PriceTick>,
): Observable<PriceTick> {
  return merge(
    ...pairs.map((pair) => {
      return priceFor(pair);
    }),
  );
}

/** The cooldown/session-cap fold's accumulator. `event`/`shouldNarrate`
 * describe the MOST RECENT anomaly this fold has seen — a fresh pair every
 * step, never stale from a prior one. `event` is `null` only in the fold's
 * seed, before any anomaly has arrived. */
interface GateState {
  readonly count: number;
  readonly lastAt: number | null;
  readonly event: AnomalyEvent | null;
  readonly shouldNarrate: boolean;
}

const INITIAL_GATE: GateState = {
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
function admitAnomaly(
  state: GateState,
  event: AnomalyEvent,
  now: number,
): GateState {
  if (state.count >= MAX_NARRATIONS_PER_SESSION) {
    return { ...state, event, shouldNarrate: false };
  }

  if (state.lastAt !== null && now - state.lastAt < NARRATION_COOLDOWN_MS) {
    return { ...state, event, shouldNarrate: false };
  }

  return { count: state.count + 1, lastAt: now, event, shouldNarrate: true };
}

/** `GateState` narrowed to the fold steps that actually admitted an anomaly
 * — see `isAdmittedGate`'s doc. */
type AdmittedGateState = GateState & { readonly event: AnomalyEvent };

/** Narrows a fold step to the ones that actually admitted an anomaly —
 * `shouldNarrate: true` is only ever set alongside a fresh (non-null)
 * `event` in `admitAnomaly`'s final branch, so narrowing on the flag alone
 * is sound. */
function isAdmittedGate(state: GateState): state is AdmittedGateState {
  return state.shouldNarrate;
}

/**
 * The capped client-side proactive narration loop: folds `deps.priceFor`'s
 * shared live FX ticks (over `deps.pairs$`'s current roster) through
 * `detectAnomalies`, and dispatches at most one `deps.narrate()` call per
 * surviving anomaly — "surviving" meaning it passed ALL of:
 *
 * 1. `deps.preference$` reads `"on"` at the moment the anomaly arrives
 *    (`withLatestFrom` — always the LATEST preference value, so flipping
 *    the preference live re-enables/disables narration for the very next
 *    anomaly with no re-composition; a `"off"` reading here is dropped
 *    WITHOUT consuming a cooldown/session-cap slot).
 * 2. `NARRATION_COOLDOWN_MS` has elapsed since the last successful
 *    narration (measured via `deps.scheduler`'s `now()`, never
 *    `Date.now()` directly — see `NARRATION_COOLDOWN_MS`'s doc).
 * 3. Fewer than `MAX_NARRATIONS_PER_SESSION` narrations have been
 *    dispatched this session (a hard, non-resetting cap).
 *
 * Both the cooldown and the session cap are enforced by a SINGLE `scan`
 * (`admitAnomaly`) that sits OUTSIDE `deps.pairs$`'s `switchMap` — i.e. it
 * folds over the machine's WHOLE-SESSION anomaly stream, not a per-roster
 * slice. This is deliberate, not incidental: `deps.pairs$` re-emitting (a
 * reconnect re-fetching reference data, say) makes `switchMap` tear down
 * and rebuild the inner merged tick source, but the gate `scan` — being
 * downstream of that `switchMap`, not nested inside it — never
 * re-subscribes and so never resets `count`/`lastAt`. A rewrite that moved
 * the gate INSIDE the switchMap (e.g. to scope it "per roster") would
 * silently let the session cap re-arm on every reconnect; that is pinned by
 * a marble test (`__tests__/NarratorMachine.test.ts`, "session cap survives
 * a pairs$ re-emission"). The same single-`scan` shape also guarantees a
 * same-frame double anomaly (two symbols crossing in the same synchronous
 * tick, or one tick crossing both channels at once) narrates AT MOST ONCE
 * GLOBALLY — not once per symbol — since `scan` folds every anomaly through
 * the identical accumulator regardless of which symbol produced it; a
 * per-symbol-keyed cooldown (e.g. a `groupBy(symbol)` + per-group
 * `throttleTime` rewrite) would regress this invisibly, which is why it too
 * is pinned by a marble test ("same-frame multi-symbol anomaly narrates
 * once").
 *
 * A composition-root singleton (mirrors `JarvisPanelsMachine`/
 * `JarvisDriverMachine`'s doctrine): built once, warm-subscribed
 * immediately, for the app's whole session — never re-created per UI
 * consumer. `stop()` tears down the one subscription; nothing else needs
 * disposing (this machine owns no Subjects of its own).
 *
 * Errors from the tick source (`priceFor` throwing, or anything inside
 * `detectAnomalies`'s fold) are guarded with `catchError(() => EMPTY)`
 * around the detector stream — an error there quietly ends narration rather
 * than propagating an unhandled error that would otherwise crash the
 * subscription (mirrors composition.ts's identical `catchError`/`EMPTY`
 * doctrine on `jarvisPanels`/`jarvisDriver`'s own `events$` sources).
 */
export function createNarratorMachine(deps: NarratorDeps): NarratorHandle {
  const scheduler = deps.scheduler ?? asyncScheduler;

  const ticks$: Observable<PriceTick> = deps.pairs$.pipe(
    switchMap((pairs) => {
      return mergedTicks$(pairs, deps.priceFor);
    }),
  );

  const anomalies$: Observable<AnomalyEvent> = detectAnomalies(
    ticks$,
    deps.config,
  ).pipe(
    catchError(() => {
      return EMPTY;
    }),
  );

  const narratePrompts$: Observable<string> = anomalies$.pipe(
    withLatestFrom(deps.preference$),
    filter(([, preference]) => {
      return preference === "on";
    }),
    map(([event]) => {
      return event;
    }),
    scan((state: GateState, event): GateState => {
      return admitAnomaly(state, event, scheduler.now());
    }, INITIAL_GATE),
    filter(isAdmittedGate),
    map((state) => {
      return formatNarrationPrompt(state.event);
    }),
  );

  const subscription = narratePrompts$.subscribe((prompt) => {
    deps.narrate(prompt);
  });

  return {
    stop: () => {
      subscription.unsubscribe();
    },
  };
}
