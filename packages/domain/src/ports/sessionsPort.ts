import type { Observable } from "rxjs";

import type { SessionInfo } from "../telemetry/session.js";

export interface SessionsPort {
  sessions$(): Observable<readonly SessionInfo[]>;
}
