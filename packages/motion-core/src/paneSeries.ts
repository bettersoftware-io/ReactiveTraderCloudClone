/** RSI window (Wilder's 14-period smoothing) and MACD's three periods
 * (12/26 fast/slow EMAs, 9-period signal EMA of the MACD line). */
export const RSI_WINDOW = 14;
export const MACD_FAST = 12;
export const MACD_SLOW = 26;
export const MACD_SIGNAL = 9;

/** Computes Wilder's RSI at every close index: `null` through the warm-up
 * (the first `RSI_WINDOW` indices), then a real value from index
 * `RSI_WINDOW` onward. The seed average gain/loss is a plain mean of the
 * first `RSI_WINDOW` deltas; thereafter each is Wilder-smoothed
 * (`(prev * (RSI_WINDOW - 1) + latest) / RSI_WINDOW`). RSI clamps to 100
 * when avgLoss is 0 (all gains) and to 50 when both are 0 (no movement). */
export function rsiValues(
  closes: readonly number[],
): readonly (number | null)[] {
  const out: (number | null)[] = Array(closes.length).fill(null);

  if (closes.length <= RSI_WINDOW) {
    return out;
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= RSI_WINDOW; i++) {
    const delta = (closes[i] as number) - (closes[i - 1] as number);
    avgGain += Math.max(0, delta);
    avgLoss += Math.max(0, -delta);
  }

  avgGain /= RSI_WINDOW;
  avgLoss /= RSI_WINDOW;
  out[RSI_WINDOW] = rsiOf(avgGain, avgLoss);

  for (let i = RSI_WINDOW + 1; i < closes.length; i++) {
    const delta = (closes[i] as number) - (closes[i - 1] as number);
    avgGain = (avgGain * (RSI_WINDOW - 1) + Math.max(0, delta)) / RSI_WINDOW;
    avgLoss = (avgLoss * (RSI_WINDOW - 1) + Math.max(0, -delta)) / RSI_WINDOW;
    out[i] = rsiOf(avgGain, avgLoss);
  }

  return out;
}

function rsiOf(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) {
    return avgGain === 0 ? 50 : 100;
  }

  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** The three series a MACD pane plots: the MACD line (fast EMA − slow EMA),
 * its signal line (a 9-period EMA of the MACD line), and their difference
 * (the histogram). Each is `null` through its own warm-up. */
export interface MacdSeries {
  readonly macd: readonly (number | null)[];
  readonly signal: readonly (number | null)[];
  readonly hist: readonly (number | null)[];
}

/** One index of the macd stream once its own warm-up has cleared, used to
 * seed and step the signal EMA below. */
interface DefinedMacdSample {
  readonly v: number;
  readonly i: number;
}

/** Computes MACD/signal/histogram from a close series. `macd` is defined
 * from index `MACD_SLOW - 1` onward (once both the fast and slow EMAs have
 * warmed up); `signal` and `hist` are defined from the 9th defined `macd`
 * value onward (index `MACD_SLOW - 1 + MACD_SIGNAL - 1`). */
export function macdValues(closes: readonly number[]): MacdSeries {
  const fast = emaSeries(closes, MACD_FAST);
  const slow = emaSeries(closes, MACD_SLOW);

  const macd = closes.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return f === null || s === null || f === undefined || s === undefined
      ? null
      : f - s;
  });

  // Signal = EMA(MACD_SIGNAL) of the macd stream, seeded per the same
  // SMA-seed convention, offset past macd's own warm-up.
  const defined = macd
    .map((v, i) => {
      return { v, i };
    })
    .filter((e): e is DefinedMacdSample => {
      return e.v !== null;
    });
  const signal: (number | null)[] = Array(closes.length).fill(null);

  if (defined.length >= MACD_SIGNAL) {
    let ema =
      defined.slice(0, MACD_SIGNAL).reduce((acc, e) => {
        return acc + e.v;
      }, 0) / MACD_SIGNAL;
    signal[(defined[MACD_SIGNAL - 1] as DefinedMacdSample).i] = ema;
    const k = 2 / (MACD_SIGNAL + 1);

    for (let d = MACD_SIGNAL; d < defined.length; d++) {
      const entry = defined[d] as DefinedMacdSample;
      ema = entry.v * k + ema * (1 - k);
      signal[entry.i] = ema;
    }
  }

  const hist = macd.map((v, i) => {
    const s = signal[i];
    return v === null || s === null || s === undefined ? null : v - s;
  });

  return { macd, signal, hist };
}

// Same recurrence as indicatorSeries.ts's private emaValues (SMA seed at
// index window-1, then k-weighted); copied locally rather than exported
// from there since paneSeries is its only would-be external consumer.
function emaSeries(
  values: readonly number[],
  window: number,
): readonly (number | null)[] {
  const seedIndex = window - 1;
  const k = 2 / (window + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;

  for (let i = 0; i < values.length; i++) {
    if (i < seedIndex) {
      out.push(null);
      continue;
    }

    const value = values[i] as number;

    if (i === seedIndex) {
      const seed =
        values.slice(0, window).reduce((sum, v) => {
          return sum + v;
        }, 0) / window;
      out.push(seed);
      prev = seed;
      continue;
    }

    const ema: number = value * k + (prev ?? 0) * (1 - k);
    out.push(ema);
    prev = ema;
  }

  return out;
}
