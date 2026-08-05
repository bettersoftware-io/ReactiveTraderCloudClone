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

/** Population mean/σ (ddof=0) — the window's own values are the whole population, not a sample drawn from a larger one. Empty window → {0, 0} (nothing to evaluate against yet). */
function meanAndStd(values: readonly number[]): { mean: number; std: number } {
  const n = values.length;
  if (n === 0) {
    return { mean: 0, std: 0 };
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * A window is treated as "zero variance" once σ falls at or below this
 * fraction of |mean| — not literal `σ === 0`. A logically-constant series
 * (e.g. the sim's per-tick spread) is only constant up to float rounding:
 * consecutive `ask - bid` values can differ by ~1 ULP (~1e-16 relative),
 * which produces a minuscule but nonzero σ. Exact-equality would treat that
 * ULP noise as real variance and report a many-σ phantom event off a series
 * that is, for every practical purpose, flat. 1e-12 sits far enough above
 * float noise (~1e-16) to absorb it, while staying many orders below any
 * variance a real market regime would produce.
 */
const ZERO_VARIANCE_RELATIVE_EPSILON = 1e-12;

/**
 * Evaluate `value` against a channel's trailing rolling window for an
 * edge-triggered sigma crossing, mutating `window`'s arming flag and
 * returning the event to emit (if any). `window` must be the trailing
 * history ONLY — `value` itself must not already be part of it (callers
 * evaluate before pushing) — so σ is an honest, unbounded distance rather
 * than one artificially capped by including the very value being judged.
 * A window whose σ is zero (or float-noise-close to zero, relative to its
 * own mean — see `ZERO_VARIANCE_RELATIVE_EPSILON`) always resolves to "not
 * crossed": dividing by it is never attempted.
 */
function evaluateCrossing(
  wasAbove: boolean,
  value: number,
  window: readonly number[],
  sigma: number,
  distance: (value: number, mean: number, std: number) => number,
): { above: boolean; sigma: number | undefined } {
  const { mean, std } = meanAndStd(window);
  if (std <= Math.abs(mean) * ZERO_VARIANCE_RELATIVE_EPSILON) {
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
 * `sigma` on the emitted event is an honest z-score of the current value
 * against the TRAILING window — the value being judged is evaluated
 * before it is folded into its own window, never against a window that
 * already contains it. This is deliberate: a self-inclusive comparison
 * caps how extreme a single outlier can ever read (bounded by
 * `sqrt(windowSize - 1)` in the limit), which would make a 250x blowout
 * and a 10,000x blowout report the same capped σ. Excluding the current
 * value keeps `sigma` unbounded and proportionate — the narrator renders
 * it as severity ("moved Nσ"), so it must stay honest.
 *
 * Both channels are edge-triggered per symbol: crossing above the
 * threshold emits exactly once; staying above emits nothing further;
 * dropping back below re-arms so the next crossing emits again. A window
 * whose σ is zero, or float-noise-close to zero relative to its own mean
 * (see `ZERO_VARIANCE_RELATIVE_EPSILON`), can never cross, by construction
 * (the division is never attempted). No tick is evaluated before
 * `minWindowFill` ticks have been seen for its symbol — before that,
 * ticks only accumulate into the window.
 *
 * Self-silencing / adaptivity: because each evaluation is against the
 * CURRENT trailing window (not a fixed historical baseline), a regime
 * shift that persists long enough to dominate — or, once `windowSize` is
 * exceeded, entirely fill — the window becomes the new normal for that
 * channel. A sustained wide-spread or high-vol regime therefore produces
 * at most one emission, not one per tick: either it never both drops
 * below and re-crosses (the plain edge-trigger latch), or the window
 * adapts around the sustained level and its own σ against itself no
 * longer clears `sigma` (the window has re-centred on the regime). This
 * is by design — the narrator should announce a regime change once, not
 * narrate every tick of an ongoing one.
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

        let ret: number | undefined;
        if (window.prevMid !== undefined && window.prevMid !== 0) {
          ret = (tick.mid - window.prevMid) / window.prevMid;
        }
        window.prevMid = tick.mid;

        // Evaluate against the TRAILING window — spread/ret are pushed in
        // further down, after evaluation, so a value is never judged
        // against a window that already contains itself (FIX 2 / honest σ).
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

        pushCapped(window.spreads, spread, cfg.windowSize);
        if (ret !== undefined) {
          pushCapped(window.returns, ret, cfg.windowSize);
        }

        return events;
      }, []),
      mergeMap((events) => from(events)),
    );
  });
}
