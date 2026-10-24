import type { Caller, ServiceContainer } from "./serviceContainer.js";
import { ThroughputService } from "./ThroughputService.js";

/** S10 — `SET_THROUGHPUT` used to change one process-wide value that every
 * login could set. Nothing on the server consumes it except the two ops
 * RPCs that read it back, so the honest fix is to scope it: each socket
 * gets its own `ThroughputService`, and the simulators stay shared. The
 * verified `caller` rides along for the effects that act as someone. */
export function scopeServicesToConnection(
  shared: ServiceContainer,
  caller: Caller,
): ServiceContainer {
  return { ...shared, throughput: new ThroughputService(), caller };
}
