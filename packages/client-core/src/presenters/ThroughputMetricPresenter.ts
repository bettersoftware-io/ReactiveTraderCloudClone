import type { Observable } from "rxjs";

import type { ThroughputMetricPresenter as ThroughputMetricPresenterApi } from "@rtc/core-api";
import type { MetricSample, TelemetryPort } from "@rtc/domain";

import { windowedSamples } from "./windowedSamples";

/** Implements `ThroughputMetricPresenter` (`@rtc/core-api`) — see the
 * interface for the contract. Rolls `TelemetryPort.throughput$()` via
 * `windowedSamples`. */
export class ThroughputMetricPresenter implements ThroughputMetricPresenterApi {
  readonly samples$: Observable<readonly MetricSample[]>;

  constructor(port: TelemetryPort) {
    this.samples$ = windowedSamples(port.throughput$());
  }
}
