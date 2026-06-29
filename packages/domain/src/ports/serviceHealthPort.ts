import type { Observable } from "rxjs";

import type { ServiceTopology } from "../telemetry/topology.js";

export interface ServiceHealthPort {
  topology$(): Observable<ServiceTopology>;
}
