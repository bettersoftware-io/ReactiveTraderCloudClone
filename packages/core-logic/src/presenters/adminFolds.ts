import {
  type LogEvent,
  MAX_LOG_ROWS,
  METRIC_WINDOW,
  type MetricSample,
} from "@rtc/domain";

/** Append `sample`, keeping the newest `METRIC_WINDOW` — the fold behind
 * every rolling KPI series. Imported by the sibling cores, never copied. */
export function appendMetricSample(
  window: readonly MetricSample[],
  sample: MetricSample,
): readonly MetricSample[] {
  return [...window, sample].slice(-METRIC_WINDOW);
}

/** Prepend `event`, keeping the newest `MAX_LOG_ROWS` (newest first). */
export function prependLogEvent(
  log: readonly LogEvent[],
  event: LogEvent,
): readonly LogEvent[] {
  return [event, ...log].slice(0, MAX_LOG_ROWS);
}

/** The confirmation banner after a successful throughput write. */
export function throughputSetMessage(value: number): string {
  return `Throughput has been set to ${value}`;
}

/** The banner after a failed throughput write. */
export const THROUGHPUT_SET_ERROR: string = "Error setting throughput";
