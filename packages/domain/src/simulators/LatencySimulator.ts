import {
  BehaviorSubject,
  concat,
  defer,
  from,
  interval,
  type Observable,
} from "rxjs";
import { map } from "rxjs/operators";

import type { MetricSample } from "../telemetry/metrics.js";
import { mulberry32 } from "../telemetry/prng.js";
import {
  METRIC_TICK_MS,
  seedHistory,
  type WalkCfg,
  walkStep,
} from "./metricWalk.js";
import type { MetricControl, Perturbation } from "./perturbation.js";

// Correlated-walk regimes (PROTO adminData.ts METRIC_CFG `lat`, tuned to this
// display's ranges): a calm ~42ms baseline vs a spiked walk pinned above the
// 150+ histogram bucket while a latencySpike incident is active.
const BASELINE: WalkCfg = { center: 42, step: 6, min: 5, max: 200 };
const SPIKE: WalkCfg = { center: 400, step: 80, min: 220, max: 600 };

export class LatencySimulator implements MetricControl {
  private readonly rng: () => number;

  private readonly perturbation$ = new BehaviorSubject<Perturbation | null>(
    null,
  );

  /** Current walk value; persists across subscriptions so the walk never resets. */
  private value = BASELINE.center;

  /** Last regime the walk stepped in, so a perturbation flip recenters it. */
  private lastRegime: WalkCfg = BASELINE;

  constructor(seed = 1) {
    this.rng = mulberry32(seed);
  }

  perturb(kind: Perturbation): void {
    this.perturbation$.next(kind);
  }

  clearPerturbation(): void {
    this.perturbation$.next(null);
  }

  private regime(): WalkCfg {
    return this.perturbation$.getValue() === "latencySpike" ? SPIKE : BASELINE;
  }

  private nextValue(): number {
    const cfg = this.regime();

    if (cfg !== this.lastRegime) {
      // Perturbation flipped: recenter the walk on the new regime instead of
      // slowly drifting across the gap between the two bands.
      this.lastRegime = cfg;
      this.value = cfg.center;
      return this.value;
    }

    this.value = walkStep(this.value, cfg, this.rng);
    return this.value;
  }

  latency$(): Observable<MetricSample> {
    return defer(() => {
      return concat(
        from(
          seedHistory(() => {
            return this.nextValue();
          }),
        ),
        interval(METRIC_TICK_MS).pipe(
          map(() => {
            return { t: Date.now(), value: this.nextValue() };
          }),
        ),
      );
    });
  }
}
