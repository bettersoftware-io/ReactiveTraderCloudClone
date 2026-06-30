import type { ServiceName } from "./topology.js";

export type Severity = "info" | "warn" | "error";

export interface LogEvent {
  readonly t: number;
  readonly severity: Severity;
  readonly service: ServiceName;
  readonly message: string;
}
