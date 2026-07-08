export type ServiceName =
  | "pricing"
  | "execution"
  | "blotter"
  | "analytics"
  | "credit"
  | "refdata"
  | "kernel";

export type ServiceStatus = "ok" | "degraded" | "down";

export interface ServiceNode {
  readonly name: ServiceName;
  readonly status: ServiceStatus;
  /** Live service health, 0-100. `status` derives from it: ≥95 ok, ≥70 degraded, else down. */
  readonly health: number;
  readonly throughput: number;
  readonly latencyMs: number;
}

export interface ServiceEdge {
  readonly from: ServiceName;
  readonly to: ServiceName;
  readonly latencyMs: number;
}

export interface ServiceTopology {
  readonly nodes: readonly ServiceNode[];
  readonly edges: readonly ServiceEdge[];
}
