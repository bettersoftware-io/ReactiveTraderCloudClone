/** Admin-view cadence, shared by every application core (ADR-006 slice 5):
 * the contract suites assert these, and `@rtc/core-contract` may not import
 * `@rtc/client-core`, so they live here — the slice-4 cooldown precedent. */

/** Rolling window — MetricSamples retained per KPI chart series. */
export const METRIC_WINDOW: number = 60;
/** Rows retained in the live event log (newest first). */
export const MAX_LOG_ROWS: number = 200;
/** Quiet period before a throughput edit is written. */
export const THROUGHPUT_DEBOUNCE_MS: number = 300;
/** How long the throughput confirmation/error banner stays up. */
export const THROUGHPUT_MESSAGE_DISMISS_MS: number = 3_000;
/** Throughput shown while loading and after a failed load. */
export const DEFAULT_THROUGHPUT: number = 100;
