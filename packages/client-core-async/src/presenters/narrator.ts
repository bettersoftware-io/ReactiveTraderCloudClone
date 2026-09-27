import type { Stream } from "@rtc/core-api";
import {
  admitAnomaly,
  formatNarrationPrompt,
  NARRATOR_INITIAL_GATE,
  type NarratorGateState,
} from "@rtc/core-logic";
import {
  type AnomalyDetectorConfig,
  type CurrencyPair,
  createAnomalyDetector,
  type JarvisNarratorPreference,
  type PriceTick,
} from "@rtc/domain";

import { relay } from "#/bridge/in";
import { reportAsync } from "#/kernel/reportAsync";

export interface NarratorDeps {
  readonly pairs$: Stream<readonly CurrencyPair[]>;
  /** The SAME shared per-pair price cache the rest of the app reads — a
   * second, independent subscription would double the simulator's tick
   * rate (the RxJS narrator's `priceFor` doc). */
  readonly priceFor: (pair: CurrencyPair) => Stream<PriceTick>;
  readonly narrate: (prompt: string) => void;
  readonly preference$: Stream<JarvisNarratorPreference>;
  readonly config?: Partial<AnomalyDetectorConfig>;
  /** The clock the cooldown is measured on. */
  readonly now: () => number;
}

/**
 * The narrator on the async core — internal, no presenter of its own. One
 * session-wide `createAnomalyDetector` step (its windows persist across
 * roster changes, as the RxJS `detectAnomalies` over a `switchMap` does)
 * reads the ticks of every pair in the latest roster; a surviving anomaly
 * is gated by the latest preference, then by the shared cooldown/cap gate,
 * and an admitted one becomes a `narrate()` turn.
 */
export function createNarrator(
  deps: NarratorDeps,
  lifetime: AbortSignal,
): void {
  const detect = createAnomalyDetector(deps.config);
  let gate: NarratorGateState = NARRATOR_INITIAL_GATE;
  let preference: JarvisNarratorPreference | null = null;
  let roster: AbortController | null = null;

  function foldTick(tick: PriceTick): void {
    for (const anomaly of detect(tick)) {
      if (preference !== "on") {
        continue;
      }

      gate = admitAnomaly(gate, anomaly, deps.now());

      if (gate.shouldNarrate) {
        deps.narrate(formatNarrationPrompt(anomaly));
      }
    }
  }

  function followRoster(pairs: readonly CurrencyPair[]): void {
    roster?.abort();
    const current = new AbortController();
    roster = current;

    for (const pair of pairs) {
      void relay(deps.priceFor(pair), current.signal, foldTick).catch(() => {
        // A failed price stream silences only its own pair until the next
        // roster. Deliberately kinder than the RxJS narrator, whose single
        // `catchError(() => EMPTY)` around the merged detector ends ALL
        // narration for the session (wave 2 PR B ruling).
      });
    }
  }

  // One listener for the narrator's life ends whichever roster is current.
  lifetime.addEventListener(
    "abort",
    () => {
      roster?.abort();
    },
    { once: true },
  );
  void relay(deps.preference$, lifetime, (next) => {
    preference = next;
  }).catch(reportAsync);
  void relay(deps.pairs$, lifetime, followRoster).catch(reportAsync);
}
