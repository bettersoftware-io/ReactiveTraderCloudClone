import type { Observable } from "rxjs";

import type { LatencyPresenter as LatencyPresenterApi } from "@rtc/core-api";
import type { MetricSample, TelemetryPort } from "@rtc/domain";

import { windowedSamples } from "./windowedSamples";

/** Implements `LatencyPresenter` (`@rtc/core-api`) — see the interface for
 * the contract. Rolls `TelemetryPort.latency$()` via `windowedSamples`. */
export class LatencyPresenter implements LatencyPresenterApi {
  readonly samples$: Observable<readonly MetricSample[]>;

  constructor(port: TelemetryPort) {
    this.samples$ = windowedSamples(port.latency$());
  }
}
