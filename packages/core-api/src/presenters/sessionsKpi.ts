import type { MetricSample } from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * Session-count KPI series for the Admin observability board's "Active
 * Sessions" card — a rolling WINDOW-sized series of session-count samples,
 * the same shape the other three KPI streams carry.
 */
export interface SessionsKpiPresenter {
  readonly countSeries$: Stream<readonly MetricSample[]>;
}
