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
