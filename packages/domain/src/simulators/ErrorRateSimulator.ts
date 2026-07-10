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

// Correlated-walk regimes (PROTO adminData.ts METRIC_CFG `err`, tuned to this
// display's ranges): a calm sub-1% baseline vs a burst walk pinned well above
// the 0.8% warn threshold while an errorBurst incident is active.
const BASELINE: WalkCfg = { center: 0.4, step: 0.15, min: 0, max: 3 };
const BURST: WalkCfg = { center: 12, step: 3, min: 5, max: 20 };

export class ErrorRateSimulator implements MetricControl {
  private readonly rng: () => number;

  private readonly perturbation$ = new BehaviorSubject<Perturbation | null>(
    null,
  );

  /** Current walk value; persists across subscriptions so the walk never resets. */
  private value = BASELINE.center;

  /** Last regime the walk stepped in, so a perturbation flip recenters it. */
  private lastRegime: WalkCfg = BASELINE;

  constructor(seed = 2) {
    this.rng = mulberry32(seed);
  }

  perturb(kind: Perturbation): void {
    this.perturbation$.next(kind);
  }

  clearPerturbation(): void {
    this.perturbation$.next(null);
  }

  private regime(): WalkCfg {
    return this.perturbation$.getValue() === "errorBurst" ? BURST : BASELINE;
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

  errorRate$(): Observable<MetricSample> {
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
