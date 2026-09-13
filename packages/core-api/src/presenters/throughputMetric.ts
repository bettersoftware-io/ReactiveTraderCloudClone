import type { MetricSample } from "@rtc/domain";

import type { Stream } from "#/stream";

/** Throughput chart series — the last WINDOW samples, oldest-first. */
export interface ThroughputMetricPresenter {
  readonly samples$: Stream<readonly MetricSample[]>;
}
