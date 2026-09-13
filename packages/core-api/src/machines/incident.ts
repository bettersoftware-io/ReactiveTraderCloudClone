export type IncidentKind = "latencySpike" | "errorBurst" | "serviceDown";
export interface IncidentIntents {
  inject(kind: IncidentKind): void;
  clear(): void;
}
export interface IncidentState {
  readonly active: readonly IncidentKind[];
}
