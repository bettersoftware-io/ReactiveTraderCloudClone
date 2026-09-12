import type { ConnectionEvent, MetricControl } from "@rtc/domain";

export type IncidentKind = "latencySpike" | "errorBurst" | "serviceDown";
export interface IncidentIntents {
  inject(kind: IncidentKind): void;
  clear(): void;
}
export interface IncidentState {
  readonly active: readonly IncidentKind[];
}
export interface IncidentDeps {
  /** Control handles for the perturbable simulators (latency, errorRate, topology). */
  readonly controls: readonly MetricControl[];
  /** Sink into the existing connectionEvents merge (composition wires this). */
  readonly pushConnectionEvent: (ev: ConnectionEvent) => void;
}
