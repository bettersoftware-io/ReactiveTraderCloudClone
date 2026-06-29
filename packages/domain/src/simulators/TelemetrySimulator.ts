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
    // Safe only because getThroughput() is a synchronous of(value); the subscribe resolves before this returns. If it ever becomes async, this would silently report the 100 placeholder.
    let v = 100;
    this.throughputSim.getThroughput().subscribe((x) => {
      v = x;
    });
    return { t: Date.now(), value: v };
  }

  throughput$(): Observable<MetricSample> {
    return defer(() => {
      return concat(
        of(this.sampleThroughput()),
        interval(2_000).pipe(
          map(() => {
            return this.sampleThroughput();
          }),
        ),
      );
    });
  }

  latency$(): Observable<MetricSample> {
    return this.latencySim.latency$();
  }

  errorRate$(): Observable<MetricSample> {
    return this.errorRateSim.errorRate$();
  }
}
