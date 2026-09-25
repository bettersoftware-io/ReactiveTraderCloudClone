import { Cause, Clock, Effect, Stream } from "effect";

import {
  admitAnomaly,
  formatNarrationPrompt,
  NARRATOR_INITIAL_GATE,
  type NarratorGateState,
} from "@rtc/client-core";
import type { Stream as CoreStream } from "@rtc/core-api";
import {
  type AnomalyDetectorConfig,
  type CurrencyPair,
  createAnomalyDetector,
  type JarvisNarratorPreference,
  type PriceTick,
} from "@rtc/domain";

import {
  createChildHost,
  type EffectHost,
  fromPortIn,
  reportOutOfBand,
  scopedPortStream,
} from "#/bridge/out";

export interface NarratorDeps {
  readonly pairs$: CoreStream<readonly CurrencyPair[]>;
  /** The SAME shared per-pair price cache the rest of the app reads — a
   * second, independent subscription would double the simulator's tick
   * rate (the RxJS narrator's `priceFor` doc). */
  readonly priceFor: (pair: CurrencyPair) => CoreStream<PriceTick>;
  readonly narrate: (prompt: string) => void;
  readonly preference$: CoreStream<JarvisNarratorPreference>;
  readonly config?: Partial<AnomalyDetectorConfig>;
}

/**
 * The narrator on the Effect core — internal, no presenter of its own. One
 * session-wide `createAnomalyDetector` step reads the ticks of every pair
 * in the latest roster (a `Stream.flatMap` with `switch`, each pair's
 * stream scoped so a roster switch releases it); a surviving anomaly is
 * gated by the latest preference, then by the shared cooldown/cap gate
 * against the Effect `Clock`, and an admitted one becomes a `narrate()`
 * turn. A failing pair is dropped from the merge and silences only itself
 * until the next roster (as on the async core — kinder than the RxJS
 * narrator's single catchError; wave 2 PR B ruling).
 */
export function createNarrator(parent: EffectHost, deps: NarratorDeps): void {
  const host = createChildHost(parent);
  const fromPort = fromPortIn(host.scope);
  const detect = createAnomalyDetector(deps.config);
  let gate: NarratorGateState = NARRATOR_INITIAL_GATE;
  let preference: JarvisNarratorPreference | null = null;

  function foldTick(tick: PriceTick, now: number): void {
    for (const anomaly of detect(tick)) {
      if (preference !== "on") {
        continue;
      }

      gate = admitAnomaly(gate, anomaly, now);

      if (gate.shouldNarrate) {
        // A narrate that throws is reported, and narration carries on — as
        // an RxJS subscriber's throw is reported without ending the stream.
        try {
          deps.narrate(formatNarrationPrompt(anomaly));
        } catch (error) {
          reportOutOfBand(Cause.die(error));
        }
      }
    }
  }

  host.runtime.runFork(
    fromPort(deps.preference$).pipe(
      Stream.runForEach((next: JarvisNarratorPreference) => {
        return Effect.sync(() => {
          preference = next;
        });
      }),
      Effect.catchAll(() => {
        return Effect.void;
      }),
    ),
    { scope: host.scope },
  );
  host.runtime.runFork(
    fromPort(deps.pairs$).pipe(
      Stream.flatMap(
        (pairs: readonly CurrencyPair[]) => {
          return Stream.mergeAll(
            pairs.map((pair) => {
              return scopedPortStream(() => {
                return deps.priceFor(pair);
              }).pipe(
                Stream.catchAll(() => {
                  return Stream.empty;
                }),
              );
            }),
            { concurrency: "unbounded" },
          );
        },
        { switch: true },
      ),
      Stream.runForEach((tick: PriceTick) => {
        return Clock.currentTimeMillis.pipe(
          Effect.andThen((now: number) => {
            return Effect.sync(() => {
              foldTick(tick, now);
            });
          }),
        );
      }),
      Effect.catchAll(() => {
        return Effect.void;
      }),
    ),
    { scope: host.scope },
  );
}
