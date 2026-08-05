import { defer, from, type Observable } from "rxjs";
import { mergeMap, scan } from "rxjs/operators";

import type { PriceTick } from "../fx/price.js";

export interface AnomalyDetectorConfig {
  /** Ticks per rolling window (per symbol). */
  readonly windowSize: number;
  /** Spread (ask - bid) z-score threshold for a spreadWidening event. */
  readonly spreadSigma: number;
  /** Mid-price return z-score threshold for a volSpike event. */
  readonly volSigma: number;
  /** Ticks required (per symbol) before any evaluation is attempted. */
  readonly minWindowFill: number;
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyDetectorConfig = {
  windowSize: 120,
  spreadSigma: 3,
  volSigma: 3,
  minWindowFill: 60,
};

export type AnomalyEvent =
  | {
      readonly kind: "spreadWidening";
      readonly symbol: string;
      readonly sigma: number;
    }
  | {
      readonly kind: "volSpike";
      readonly symbol: string;
      readonly sigma: number;
    };

interface SymbolWindow {
  tickCount: number;
  spreads: number[];
  returns: number[];
  prevMid: number | undefined;
  spreadAbove: boolean;
  volAbove: boolean;
}

function createSymbolWindow(): SymbolWindow {
  return {
    tickCount: 0,
    spreads: [],
    returns: [],
    prevMid: undefined,
    spreadAbove: false,
    volAbove: false,
  };
}

/** Push `value` onto `buf`, dropping the oldest entry past `cap`. */
function pushCapped(buf: number[], value: number, cap: number): void {
  buf.push(value);
  if (buf.length > cap) {
    buf.shift();
  }
}

/** Population mean/σ (ddof=0) — the window's own values are the whole population, not a sample drawn from a larger one. */
function meanAndStd(values: readonly number[]): { mean: number; std: number } {
  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Evaluate one channel's rolling window for an edge-triggered sigma
 * crossing, mutating `window`'s arming flag and returning the event to
 * emit (if any). `std === 0` (a constant series) always resolves to "not
 * crossed" — dividing by it is never attempted.
 */
function evaluateCrossing(
  wasAbove: boolean,
  value: number,
  window: readonly number[],
  sigma: number,
  distance: (value: number, mean: number, std: number) => number,
): { above: boolean; sigma: number | undefined } {
  const { mean, std } = meanAndStd(window);
  if (std === 0) {
    return { above: false, sigma: undefined };
  }

  const z = distance(value, mean, std);
  const above = z >= sigma;
  return { above, sigma: !wasAbove && above ? z : undefined };
}

/**
 * Pure, scan-based edge-triggered anomaly detector over a `PriceTick`
 * stream — the deterministic trigger source for the proactive narrator.
 * No wall-clock reads and no I/O: rolling windows are sized by tick count
 * (`windowSize`), not time, so the same tick sequence always produces the
 * same events.
 *
 * Each symbol gets its own independent rolling window (capped at
 * `windowSize` ticks) and its own two edge-triggered channels:
 *
 * - `spreadWidening`: z-score of the current tick's spread (ask - bid)
 *   against that window's own mean/σ, crossing `spreadSigma`.
 * - `volSpike`: the rolling σ of mid-price returns *is* the symbol's own
 *   trailing "baseline" volatility scale (this is the chosen reading of
 *   the brief's "volSigma × its own baseline" — the window's own σ stands
 *   in for a separately-tracked long-run average, so both channels reduce
 *   to the same shape: a single-tick value's z-score against one rolling
 *   window statistic). A tick's |return| crossing `volSigma` × that σ
 *   fires.
 *
 * Both channels are edge-triggered per symbol: crossing above the
 * threshold emits exactly once; staying above emits nothing further;
 * dropping back below re-arms so the next crossing emits again. A
 * constant series (σ=0) can never cross, by construction (the division is
 * never attempted). No tick is evaluated before `minWindowFill` ticks have
 * been seen for its symbol — before that, ticks only accumulate into the
 * window.
 */
export function detectAnomalies(
  ticks$: Observable<PriceTick>,
  config: Partial<AnomalyDetectorConfig> = {},
): Observable<AnomalyEvent> {
  const cfg: AnomalyDetectorConfig = { ...DEFAULT_ANOMALY_CONFIG, ...config };

  return defer(() => {
    const windows = new Map<string, SymbolWindow>();

    return ticks$.pipe(
      scan<PriceTick, AnomalyEvent[]>((_previousEvents, tick) => {
        const events: AnomalyEvent[] = [];
        const window = windows.get(tick.symbol) ?? createSymbolWindow();
        windows.set(tick.symbol, window);

        window.tickCount += 1;

        const spread = tick.ask - tick.bid;
        pushCapped(window.spreads, spread, cfg.windowSize);

        let ret: number | undefined;
        if (window.prevMid !== undefined && window.prevMid !== 0) {
          ret = (tick.mid - window.prevMid) / window.prevMid;
          pushCapped(window.returns, ret, cfg.windowSize);
        }
        window.prevMid = tick.mid;

        if (window.tickCount >= cfg.minWindowFill) {
          const spreadResult = evaluateCrossing(
            window.spreadAbove,
            spread,
            window.spreads,
            cfg.spreadSigma,
            (value, mean, std) => (value - mean) / std,
          );
          window.spreadAbove = spreadResult.above;
          if (spreadResult.sigma !== undefined) {
            events.push({
              kind: "spreadWidening",
              symbol: tick.symbol,
              sigma: spreadResult.sigma,
            });
          }

          if (ret !== undefined) {
            const volResult = evaluateCrossing(
              window.volAbove,
              ret,
              window.returns,
              cfg.volSigma,
              (value, _mean, std) => Math.abs(value) / std,
            );
            window.volAbove = volResult.above;
            if (volResult.sigma !== undefined) {
              events.push({
                kind: "volSpike",
                symbol: tick.symbol,
                sigma: volResult.sigma,
              });
            }
          }
        }

        return events;
      }, []),
      mergeMap((events) => from(events)),
    );
  });
}
