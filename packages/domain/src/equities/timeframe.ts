/** Candle chart timeframe. Widens the requested history: "1D" is today's
 * one-minute-bucket window (the existing, unparameterised default — kept
 * byte-identical for backward compatibility); "1W"/"1M"/"3M" widen the
 * bucket duration and candle count so the chart shows a longer span at
 * coarser resolution. Purely a display concern for the simulator; a real
 * feed would map this to an actual historical-data query. */
export type CandleTimeframe = "1D" | "1W" | "1M" | "3M";

/** All timeframe values, in ascending span order. */
export const CANDLE_TIMEFRAMES: readonly CandleTimeframe[] = [
  "1D",
  "1W",
  "1M",
  "3M",
];

/** Total candles generated per timeframe — the pan/zoom history depth. The
 * newest CANDLE_DEFAULT_VISIBLE[tf] of these are byte-identical to the
 * pre-deepening series (older candles are PREPENDED from an independent
 * seeded walk; see EquityMarketDataSimulator). */
export const CANDLE_HISTORY_TOTAL = 300;

/** Candles per backfill page — what the client requests per near-edge fetch. */
export const CANDLE_HISTORY_PAGE = 300;

/** Total obtainable history per (symbol, timeframe): the live
 * CANDLE_HISTORY_TOTAL plus 9 backfill pages. Requests beyond it return
 * short/empty pages — the exhaustion signal. */
export const CANDLE_HISTORY_DEPTH_MAX = 3000;

/** Default chart-viewport size per timeframe = the pre-deepening candle
 * count, so the default view still spans the named period. */
export const CANDLE_DEFAULT_VISIBLE: Readonly<Record<CandleTimeframe, number>> =
  {
    "1D": 60,
    "1W": 44,
    "1M": 48,
    "3M": 52,
  };
