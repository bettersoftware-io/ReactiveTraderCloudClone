export type Perturbation = "latencySpike" | "errorBurst" | "serviceDown";

export interface MetricControl {
  perturb(kind: Perturbation): void;
  clearPerturbation(): void;
}
