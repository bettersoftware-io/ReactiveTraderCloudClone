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

export class ErrorRateSimulator implements MetricControl {
  private readonly rng: () => number;

  private readonly perturbation$ = new BehaviorSubject<Perturbation | null>(
    null,
  );

  constructor(seed = 2) {
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
      p === "errorBurst"
        ? 8 + this.rng() * 12 // 8-20% burst
        : this.rng() * 1; // 0-1% baseline
    return { t: Date.now(), value };
  }

  errorRate$(): Observable<MetricSample> {
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
