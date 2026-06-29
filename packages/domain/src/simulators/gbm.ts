import type { Candle } from "../equities/candle.js";

export { mulberry32 } from "./seededRandom.js";

/** One geometric-Brownian-motion-ish step. `rand` in [0,1]; vol scales the
 * symmetric drift. rand=0.5 → no move; rand<0.5 → down; rand>0.5 → up. */
export function gbmStep(price: number, rand: number, vol: number): number {
  return price * (1 + (rand - 0.5) * 2 * vol);
}

/** OHLC fold: extends `prev` if it shares `time`'s bucket, else opens a new
 * bar. `bucketMs` floors `time` to the bar boundary. */
export function aggregateCandle(
  prev: Candle | null,
  price: number,
  time: number,
  bucketMs: number,
): Candle {
  const bucket = Math.floor(time / bucketMs) * bucketMs;

  if (!prev || prev.time !== bucket) {
    return { time: bucket, open: price, high: price, low: price, close: price };
  }

  return {
    time: bucket,
    open: prev.open,
    high: Math.max(prev.high, price),
    low: Math.min(prev.low, price),
    close: price,
  };
}
