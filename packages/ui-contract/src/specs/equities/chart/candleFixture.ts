import type { Candle } from "@rtc/domain";

/** One-minute bucket width — the shortest bucket, so time-label/crosshair
 * readouts format as HH:MM (formatTimeLabel's under-a-day branch). */
const BUCKET_MS = 60_000;
/** Volume crosses the compactVolume 1M threshold partway through a 300-long
 * series (index 0 = 1,000,000 exactly), exercising both its plain-K and
 * "N.NM" formatting branches across the fixture. */
const VOLUME_STEP = 1_000;
const VOLUME_BASE = 1_000_000;

/**
 * A deterministic ~300-candle series (AAPL-shaped): a two-step open/close
 * oscillation so every candle's OHLCV is hand-computable straight from its
 * index — see {@link candleAt}. Long enough that a timeframe's default
 * visible window (60 for 1D) is a small slice of it, making pan/zoom/Home/
 * End viewport behaviour observable against the un-windowed series.
 */
export function generateCandles(count: number): readonly Candle[] {
  return Array.from({ length: count }, (_, i) => {
    return candleAt(i);
  });
}

/** The single candle at series index `i`: open = 100 + i; close = open + 1
 * on even i, open - 1 on odd i (so direction alternates candle-to-candle);
 * high/low pad ±1 around the body; volume climbs by 1000 per index; time is
 * `i` one-minute buckets past the epoch. Exported so specs can hand-compute
 * expected values (crosshair readouts, up/down direction, …) for any index
 * without re-deriving the formula. */
export function candleAt(i: number): Candle {
  const open = 100 + i;
  const close = i % 2 === 0 ? open + 1 : open - 1;

  return {
    time: i * BUCKET_MS,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: VOLUME_BASE + i * VOLUME_STEP,
  };
}
