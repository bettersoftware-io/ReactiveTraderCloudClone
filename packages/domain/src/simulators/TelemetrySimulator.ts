import { concat, defer, interval, type Observable, of } from "rxjs";
import { map } from "rxjs/operators";

import type { TelemetryPort } from "../ports/telemetryPort.js";
import type { MetricSample } from "../telemetry/metrics.js";
import type { ErrorRateSimulator } from "./ErrorRateSimulator.js";
import type { LatencySimulator } from "./LatencySimulator.js";
import type { ThroughputSimulator } from "./ThroughputSimulator.js";

export class TelemetrySimulator implements TelemetryPort {
  constructor(
    private readonly throughputSim: ThroughputSimulator,
    private readonly latencySim: LatencySimulator,
    private readonly errorRateSim: ErrorRateSimulator,
  ) {}

  private sampleThroughput(): MetricSample {
    let v = 100;
    this.throughputSim.getThroughput().subscribe((x) => {
      v = x;
    });
    return { t: Date.now(), value: v };
  }

  throughput$(): Observable<MetricSample> {
    return defer(() =>
      concat(
        of(this.sampleThroughput()),
        interval(2_000).pipe(map(() => this.sampleThroughput())),
      ),
    );
  }

  latency$(): Observable<MetricSample> {
    return this.latencySim.latency$();
  }

  errorRate$(): Observable<MetricSample> {
    return this.errorRateSim.errorRate$();
  }
}
