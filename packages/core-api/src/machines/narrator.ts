import type { SchedulerLike } from "rxjs";

import type {
  AnomalyDetectorConfig,
  CurrencyPair,
  JarvisNarratorPreference,
  PriceTick,
} from "@rtc/domain";

import type { Stream } from "#/stream";

export interface NarratorDeps {
  /** The live FX pair roster to detect over — composition wires this from
   * `CurrencyPairsPresenter.pairs$` (the FX counterpart of the equities
   * `knownSymbols$` `JarvisDriverMachine` reads from the watchlist). Each
   * emission replaces which pairs' tick streams are merged into the
   * detector's source (see `mergedTicks$`'s doc) — in practice this emits
   * once, at composition time, since the FX pair roster doesn't change
   * mid-session (though see `priceFor`'s doc for why the gate below is
   * pinned to survive a re-emission regardless). */
  readonly pairs$: Stream<readonly CurrencyPair[]>;
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
  readonly priceFor: (pair: CurrencyPair) => Stream<PriceTick>;
  /** Dispatches a narration turn — composition wires this to
   * `JarvisMachineHandle.intents.narrate`. Called with the prompt ALREADY
   * carrying `JARVIS_NARRATION_PREFIX`, per that intent's own contract. */
  readonly narrate: (prompt: string) => void;
  /** The user's stored narrator preference — `"off"` drops every surviving
   * anomaly without consuming a cooldown/session-cap slot, but this
   * machine stays subscribed throughout (see `createNarratorMachine`'s
   * doc): flipping back to `"on"` re-enables narration for the NEXT
   * anomaly, with no re-composition needed. */
  readonly preference$: Stream<JarvisNarratorPreference>;
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

export interface NarratorHandle {
  readonly stop: () => void;
}
