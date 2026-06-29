import { type Observable, shareReplay } from "rxjs";
import { scan, startWith } from "rxjs/operators";

import type { MetricSample, TelemetryPort } from "@rtc/domain";

/** Rolling window size — number of MetricSamples retained per chart series. */
export const WINDOW = 60;

function windowedSamples(
  source$: Observable<MetricSample>,
): Observable<readonly MetricSample[]> {
  return source$.pipe(
    scan(
      (acc, s) => [...acc, s].slice(-WINDOW) as readonly MetricSample[],
      [] as readonly MetricSample[],
    ),
    startWith([] as readonly MetricSample[]),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
}

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

/**
 * Latency chart series — rolls the last WINDOW samples from
 * TelemetryPort.latency$() in oldest-first order.
 */
export class LatencyPresenter {
  readonly samples$: Observable<readonly MetricSample[]>;

  constructor(port: TelemetryPort) {
    this.samples$ = windowedSamples(port.latency$());
  }
}

/**
 * Error-rate chart series — rolls the last WINDOW samples from
 * TelemetryPort.errorRate$() in oldest-first order.
 */
export class ErrorRatePresenter {
  readonly samples$: Observable<readonly MetricSample[]>;

  constructor(port: TelemetryPort) {
    this.samples$ = windowedSamples(port.errorRate$());
  }
}
