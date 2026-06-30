import type { Observable } from "rxjs";

import type { MetricSample, TelemetryPort } from "@rtc/domain";

import { windowedSamples } from "./windowedSamples";

/**
 * Throughput chart series — rolls the last WINDOW samples from
 * TelemetryPort.throughput$() in oldest-first order.
 */
export class ThroughputMetricPresenter {
  readonly samples$: Observable<readonly MetricSample[]>;

  constructor(port: TelemetryPort) {
    this.samples$ = windowedSamples(port.throughput$());
  }
}
