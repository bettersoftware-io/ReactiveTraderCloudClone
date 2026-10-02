import type { ServiceContainer } from "./serviceContainer.js";
import { ThroughputService } from "./ThroughputService.js";

/** S10 — `SET_THROUGHPUT` used to change one process-wide value that every
 * login could set. Nothing on the server consumes it except the two admin
 * RPCs that read it back, so the honest fix is to scope it: each socket
 * gets its own `ThroughputService`, and the simulators stay shared. */
export function scopeServicesToConnection(
  shared: ServiceContainer,
): ServiceContainer {
  return { ...shared, throughput: new ThroughputService() };
}
