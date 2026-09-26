import type { Candle } from "@rtc/domain";

/** The backfilled pages stitched AHEAD of the live base series. Only
 * candles strictly older than the base's first survive (the contiguity
 * guard), and the result holds at most one entry per `time` — so a page
 * landing twice, or an overlap surviving the guard, can never render twice.
 * An empty base is an empty series: there is nothing to be older than. */
export function stitchCandles(
  older: readonly Candle[],
  base: readonly Candle[],
): readonly Candle[] {
  const first = base[0];

  if (older.length === 0 || first === undefined) {
    return dedupeByTime(base);
  }

  const contiguous = older.filter((candle) => {
    return candle.time < first.time;
  });
  return dedupeByTime([...contiguous, ...base]);
}

/** At most one entry per `time`, keeping the FIRST-seen position (a `Map`'s
 * `.set` on an existing key updates the value without moving it). */
function dedupeByTime(candles: readonly Candle[]): readonly Candle[] {
  const byTime = new Map<number, Candle>();

  for (const candle of candles) {
    byTime.set(candle.time, candle);
  }

  return [...byTime.values()];
}
