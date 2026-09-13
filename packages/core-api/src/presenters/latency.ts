import type { MetricSample } from "@rtc/domain";

import type { Stream } from "#/stream";

/** Latency chart series — the last WINDOW samples, oldest-first. */
export interface LatencyPresenter {
  readonly samples$: Stream<readonly MetricSample[]>;
}
