import type { Observable } from "rxjs";

import type { LatencyPresenter as LatencyPresenterApi } from "@rtc/core-api";
import type { MetricSample, TelemetryPort } from "@rtc/domain";

import { windowedSamples } from "./windowedSamples";

/**
 * Latency chart series — rolls the last WINDOW samples from
 * TelemetryPort.latency$() in oldest-first order.
 */
export class LatencyPresenter implements LatencyPresenterApi {
  readonly samples$: Observable<readonly MetricSample[]>;

  constructor(port: TelemetryPort) {
    this.samples$ = windowedSamples(port.latency$());
  }
}
