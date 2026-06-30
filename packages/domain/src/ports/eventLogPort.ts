import type { Observable } from "rxjs";

import type { LogEvent } from "../telemetry/log.js";

export interface EventLogPort {
  events$(): Observable<LogEvent>;
}
