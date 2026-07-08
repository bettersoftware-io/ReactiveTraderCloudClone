import {
  BehaviorSubject,
  concat,
  defer,
  interval,
  type Observable,
  of,
} from "rxjs";
import { map } from "rxjs/operators";

import type { ServiceHealthPort } from "../ports/serviceHealthPort.js";
import { mulberry32 } from "../telemetry/prng.js";
import type {
  ServiceEdge,
  ServiceName,
  ServiceNode,
  ServiceStatus,
  ServiceTopology,
} from "../telemetry/topology.js";
import { type WalkCfg, walkStep } from "./metricWalk.js";
import type { MetricControl, Perturbation } from "./perturbation.js";

const SERVICE_NAMES: readonly ServiceName[] = [
  "pricing",
  "execution",
  "blotter",
  "analytics",
  "credit",
  "refdata",
  "kernel",
];

// Per-service health-walk regimes (all bands inside [0, 100]): most services
// hug a calm ~99, refdata is the visibly lower + choppier one (center ~86,
// step 4) and blotter sits mid (~93), straddling the ok/degraded threshold —
// so the board reads as a living fleet, not seven identical green rows.
const HEALTH_CFG: Record<ServiceName, WalkCfg> = {
  pricing: { center: 99, step: 1, min: 97, max: 100 },
  execution: { center: 98.5, step: 1, min: 96, max: 100 },
  blotter: { center: 93, step: 2, min: 88, max: 98 },
  analytics: { center: 99, step: 1, min: 97, max: 100 },
  credit: { center: 98, step: 1.5, min: 95, max: 100 },
  refdata: { center: 86, step: 4, min: 76, max: 94 },
  kernel: { center: 99.5, step: 0.5, min: 98, max: 100 },
};

// Health → status thresholds: ≥95 ok, ≥70 degraded, else down.
const OK_MIN_HEALTH = 95;
const DEGRADED_MIN_HEALTH = 70;

function statusForHealth(health: number): ServiceStatus {
  if (health >= OK_MIN_HEALTH) return "ok";
  if (health >= DEGRADED_MIN_HEALTH) return "degraded";
  return "down";
}

const OTHER_SERVICES: readonly ServiceName[] = SERVICE_NAMES.filter((n) => {
  return n !== "kernel";
});

export class ServiceTopologySimulator
  implements ServiceHealthPort, MetricControl
{
  private readonly rng: () => number;

  private readonly perturbation$ = new BehaviorSubject<Perturbation | null>(
    null,
  );

  private nodeThroughputs: number[];

  private nodeLatencies: number[];

  private nodeHealths: number[];

  private edgeLatencies: number[];

  constructor(seed = 3) {
    this.rng = mulberry32(seed);
    // Initialize node values: throughput ~50-200, latencyMs ~1-20
    this.nodeThroughputs = SERVICE_NAMES.map(() => {
      return 50 + this.rng() * 150;
    });
    this.nodeLatencies = SERVICE_NAMES.map(() => {
      return 1 + this.rng() * 19;
    });
    // Health walks start exactly on each service's regime center.
    this.nodeHealths = SERVICE_NAMES.map((name) => {
      return HEALTH_CFG[name].center;
    });
    // 6 edges (kernel → each other service): latencyMs ~0.5-5
    this.edgeLatencies = Array.from({ length: OTHER_SERVICES.length }, () => {
      return 0.5 + this.rng() * 4.5;
    });
  }

  perturb(kind: Perturbation): void {
    this.perturbation$.next(kind);
  }

  clearPerturbation(): void {
    this.perturbation$.next(null);
  }

  private walk(v: number): number {
    return v * (1 + (this.rng() - 0.5) * 0.1);
  }

  private buildTopology(): ServiceTopology {
    const p = this.perturbation$.getValue();

    const nodes: ServiceNode[] = SERVICE_NAMES.map((name, i) => {
      // A serviceDown incident hard-kills pricing: health reads 0, and the
      // threshold derivation below then forces its status to "down".
      const health =
        p === "serviceDown" && name === "pricing"
          ? 0
          : (this.nodeHealths[i] ?? HEALTH_CFG[name].center);
      return {
        name,
        status: statusForHealth(health),
        health,
        throughput: this.nodeThroughputs[i] ?? 100,
        latencyMs: this.nodeLatencies[i] ?? 5,
      };
    });

    const edges: ServiceEdge[] = OTHER_SERVICES.map((name, i) => {
      return {
        from: "kernel",
        to: name,
        latencyMs:
          p === "serviceDown" && name === "pricing"
            ? 800
            : (this.edgeLatencies[i] ?? 2),
      };
    });

    return { nodes, edges };
  }

  private tick(): void {
    this.nodeThroughputs = this.nodeThroughputs.map((v) => {
      return this.walk(v);
    });
    this.nodeLatencies = this.nodeLatencies.map((v) => {
      return this.walk(v);
    });
    this.nodeHealths = this.nodeHealths.map((v, i) => {
      return walkStep(v, HEALTH_CFG[SERVICE_NAMES[i]], this.rng);
    });
    this.edgeLatencies = this.edgeLatencies.map((v) => {
      return this.walk(v);
    });
  }

  topology$(): Observable<ServiceTopology> {
    return defer(() => {
      return concat(
        of(this.buildTopology()),
        interval(2_000).pipe(
          map(() => {
            this.tick();
            return this.buildTopology();
          }),
        ),
      );
    });
  }
}
