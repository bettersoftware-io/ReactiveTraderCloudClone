import type { Observable } from "rxjs";

import type { MetricSample } from "../telemetry/metrics.js";

export interface TelemetryPort {
  throughput$(): Observable<MetricSample>;
  latency$(): Observable<MetricSample>;
  errorRate$(): Observable<MetricSample>;
}
