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
  ServiceTopology,
} from "../telemetry/topology.js";
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

const OTHER_SERVICES: readonly ServiceName[] = SERVICE_NAMES.filter(
  (n) => n !== "kernel",
);

export class ServiceTopologySimulator
  implements ServiceHealthPort, MetricControl
{
  private readonly rng: () => number;
  private readonly perturbation$ = new BehaviorSubject<Perturbation | null>(
    null,
  );
  private nodeThroughputs: number[];
  private nodeLatencies: number[];
  private edgeLatencies: number[];

  constructor(seed = 3) {
    this.rng = mulberry32(seed);
    // Initialize node values: throughput ~50-200, latencyMs ~1-20
    this.nodeThroughputs = SERVICE_NAMES.map(() => 50 + this.rng() * 150);
    this.nodeLatencies = SERVICE_NAMES.map(() => 1 + this.rng() * 19);
    // 6 edges (kernel → each other service): latencyMs ~0.5-5
    this.edgeLatencies = Array.from(
      { length: OTHER_SERVICES.length },
      () => 0.5 + this.rng() * 4.5,
    );
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

    const nodes: ServiceNode[] = SERVICE_NAMES.map((name, i) => ({
      name,
      status: p === "serviceDown" && name === "pricing" ? "down" : "ok",
      throughput: this.nodeThroughputs[i] ?? 100,
      latencyMs: this.nodeLatencies[i] ?? 5,
    }));

    const edges: ServiceEdge[] = OTHER_SERVICES.map((name, i) => ({
      from: "kernel",
      to: name,
      latencyMs:
        p === "serviceDown" && name === "pricing"
          ? 800
          : (this.edgeLatencies[i] ?? 2),
    }));

    return { nodes, edges };
  }

  private tick(): void {
    this.nodeThroughputs = this.nodeThroughputs.map((v) => this.walk(v));
    this.nodeLatencies = this.nodeLatencies.map((v) => this.walk(v));
    this.edgeLatencies = this.edgeLatencies.map((v) => this.walk(v));
  }

  topology$(): Observable<ServiceTopology> {
    return defer(() =>
      concat(
        of(this.buildTopology()),
        interval(2_000).pipe(
          map(() => {
            this.tick();
            return this.buildTopology();
          }),
        ),
      ),
    );
  }
}
