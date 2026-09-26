import {
  asyncScheduler,
  EMPTY,
  merge,
  type Observable,
  type SchedulerLike,
} from "rxjs";
import {
  catchError,
  filter,
  map,
  scan,
  switchMap,
  withLatestFrom,
} from "rxjs/operators";

import type { NarratorHandle } from "@rtc/core-api";
import {
  admitAnomaly,
  formatNarrationPrompt,
  isAdmittedGate,
  NARRATOR_INITIAL_GATE,
  type NarratorGateState,
} from "@rtc/core-logic";
import {
  type AnomalyDetectorConfig,
  type AnomalyEvent,
  type CurrencyPair,
  detectAnomalies,
  type JarvisNarratorPreference,
  MAX_NARRATIONS_PER_SESSION,
  NARRATION_COOLDOWN_MS,
  type PriceTick,
} from "@rtc/domain";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { NarratorHandle };

export interface NarratorDeps {
  /** The live FX pair roster to detect over — composition wires this from
   * `CurrencyPairsPresenter.pairs$` (the FX counterpart of the equities
   * `knownSymbols$` `JarvisDriverMachine` reads from the watchlist). Each
   * emission replaces which pairs' tick streams are merged into the
   * detector's source (see `mergedTicks$`'s doc) — in practice this emits
   * once, at composition time, since the FX pair roster doesn't change
   * mid-session (though see `priceFor`'s doc for why the gate below is
   * pinned to survive a re-emission regardless). */
  readonly pairs$: Observable<readonly CurrencyPair[]>;
  /**
   * Resolves ONE symbol's live tick stream — composition injects
   * `PriceStreamPresenter.price$` (the SAME shared, per-symbol-cached,
   * `refCount`-multicast stream every price-driven UI surface already reads
   * through — see `AnimationDirector`'s identical `priceFor` injection),
   * never a fresh direct `PricingPort.getPriceUpdates(symbol)` call.
   *
   * This is a correctness requirement, not a style preference: the
   * simulator's live tick stream is COLD per subscription, and each
   * subscription runs its OWN `setTimeout` walk loop that mutates SHARED
   * per-pair simulator state (mid/history/`pricingAnomalyEpisode`'s episode
   * clock). Two independent direct subscriptions to the same symbol — one
   * from this machine, one from a price tile — therefore double that
   * symbol's effective tick rate and halve its anomaly-episode interval
   * (the #171 tick-acceleration family, reintroduced in a new spot). Going
   * through the injected, cached `priceFor` instead means every caller for
   * the same symbol shares the ONE underlying subscription.
   *
   * Two consequences, both accepted:
   * - This machine's own permanent subscription (see `createNarratorMachine`'s
   *   doc — it never disposes) pins `priceFor`'s shared per-symbol streams
   *   warm for the app's whole session, even after every UI consumer of the
   *   same symbol has unmounted.
   * - `PriceStreamPresenter.price$` conflates to at most one emission per
   *   250ms while the user is in power-saver "calm" (`conflateWhen`) — under
   *   that mode the detector sees fewer ticks than the raw wire rate (and
   *   could in principle miss a very brief single-tick spike between
   *   throttle windows). This matches how every other price-driven surface
   *   already throttles under calm, rather than special-casing this machine
   *   to bypass it.
   */
  readonly priceFor: (pair: CurrencyPair) => Observable<PriceTick>;
  /** Dispatches a narration turn — composition wires this to
   * `JarvisMachineHandle.intents.narrate`. Called with the prompt ALREADY
   * carrying `JARVIS_NARRATION_PREFIX`, per that intent's own contract. */
  readonly narrate: (prompt: string) => void;
  /** The user's stored narrator preference — `"off"` drops every surviving
   * anomaly without consuming a cooldown/session-cap slot, but this
   * machine stays subscribed throughout (see `createNarratorMachine`'s
   * doc): flipping back to `"on"` re-enables narration for the NEXT
   * anomaly, with no re-composition needed. */
  readonly preference$: Observable<JarvisNarratorPreference>;
  /** Injected for the cooldown gate's `now()` reads — a `TestScheduler` in
   * tests, `undefined` (rxjs's own `asyncScheduler`, whose `now()` is
   * `Date.now()`) in production. Mirrors `JarvisDriverDeps.scheduler`'s
   * identical injection idiom. */
  readonly scheduler?: SchedulerLike;
  /** Overrides `DEFAULT_ANOMALY_CONFIG` — composition threads this from the
   * dev-only `?narratorThresholds=test` seam (both web clients'
   * `buildBrowserPorts.ts`), `undefined` in production. */
  readonly config?: Partial<AnomalyDetectorConfig>;
}

/** Re-exported from `@rtc/domain` (`jarvis/jarvisConstants.ts`), where the
 * contract suites can read them (pluggable-core slice 7 wave 2). */
export { MAX_NARRATIONS_PER_SESSION, NARRATION_COOLDOWN_MS };

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
    scan((state: NarratorGateState, event): NarratorGateState => {
      return admitAnomaly(state, event, scheduler.now());
    }, NARRATOR_INITIAL_GATE),
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
