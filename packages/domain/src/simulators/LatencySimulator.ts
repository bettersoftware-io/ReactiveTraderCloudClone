import {
  BehaviorSubject,
  concat,
  defer,
  interval,
  type Observable,
  of,
} from "rxjs";
import { map } from "rxjs/operators";

import type { MetricSample } from "../telemetry/metrics.js";
import { mulberry32 } from "../telemetry/prng.js";
import type { MetricControl, Perturbation } from "./perturbation.js";

export class LatencySimulator implements MetricControl {
  private readonly rng: () => number;

  private readonly perturbation$ = new BehaviorSubject<Perturbation | null>(
    null,
  );

  constructor(seed = 1) {
    this.rng = mulberry32(seed);
  }

  perturb(kind: Perturbation): void {
    this.perturbation$.next(kind);
  }

  clearPerturbation(): void {
    this.perturbation$.next(null);
  }

  private sample(): MetricSample {
    const p = this.perturbation$.getValue();
    const value =
      p === "latencySpike"
        ? 200 + this.rng() * 400 // ~200-600ms spike
        : 5 + this.rng() * 25; // ~5-30ms baseline
    return { t: Date.now(), value };
  }

  latency$(): Observable<MetricSample> {
    return defer(() => {
      return concat(
        of(this.sample()),
        interval(1_000).pipe(
          map(() => {
            return this.sample();
          }),
        ),
      );
    });
  }
}
