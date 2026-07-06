import { concat, defer, interval, type Observable, of } from "rxjs";
import { map } from "rxjs/operators";

import type { TelemetryPort } from "../ports/telemetryPort.js";
import type { MetricSample } from "../telemetry/metrics.js";
import { mulberry32 } from "../telemetry/prng.js";
import type { ErrorRateSimulator } from "./ErrorRateSimulator.js";
import type { LatencySimulator } from "./LatencySimulator.js";
import type { ThroughputSimulator } from "./ThroughputSimulator.js";

// Walk step size and clamp band, both expressed as a fraction of the current
// admin-set setpoint (PROTO's throughput feed is a lively random walk, not a
// flat line glued to the slider value — see final-review I-2).
const WALK_STEP_FRACTION = 0.08;
const WALK_CLAMP_FRACTION = 0.25;

export class TelemetrySimulator implements TelemetryPort {
  private readonly rng: () => number;

  /** Current offset from the setpoint, in the same units as the setpoint. */
  private walkOffset = 0;

  /** Last observed setpoint, so a slider change can recenter the walk. */
  private lastSetpoint: number | undefined;

  constructor(
    private readonly throughputSim: ThroughputSimulator,
    private readonly latencySim: LatencySimulator,
    private readonly errorRateSim: ErrorRateSimulator,
    seed = 3,
  ) {
    this.rng = mulberry32(seed);
  }

  private sampleThroughput(): MetricSample {
    // Safe only because getThroughput() is a synchronous of(value); the subscribe resolves before this returns. If it ever becomes async, this would silently report the 100 placeholder.
    let setpoint = 100;
    this.throughputSim.getThroughput().subscribe((x) => {
      setpoint = x;
    });

    if (this.lastSetpoint !== setpoint) {
      // First sample, or the admin slider moved: recenter the walk exactly
      // on the new setpoint instead of carrying over a stale offset.
      this.lastSetpoint = setpoint;
      this.walkOffset = 0;
    } else {
      const step = (this.rng() * 2 - 1) * WALK_STEP_FRACTION * setpoint;
      const clamp = WALK_CLAMP_FRACTION * setpoint;
      this.walkOffset = Math.min(
        clamp,
        Math.max(-clamp, this.walkOffset + step),
      );
    }

    return { t: Date.now(), value: Math.max(0, setpoint + this.walkOffset) };
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
