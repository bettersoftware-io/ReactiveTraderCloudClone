import type { MetricSample } from "@rtc/domain";

import type { Stream } from "#/stream";

/** Error-rate chart series — the last WINDOW samples, oldest-first. */
export interface ErrorRatePresenter {
  readonly samples$: Stream<readonly MetricSample[]>;
}
