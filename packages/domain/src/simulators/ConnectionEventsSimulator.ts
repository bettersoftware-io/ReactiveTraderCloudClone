// packages/domain/src/simulators/ConnectionEventsSimulator.ts
import { of, type Observable } from "rxjs";
import type { ConnectionEvent } from "../connection/connectionStatus.js";
import type { ConnectionEventsPort } from "../ports/connectionEventsPort.js";

/**
 * ConnectionEventsPort for simulator mode.
 * No real gateway exists, so the simulator emits a single one-shot
 * gatewayConnected event and completes. The state machine reaches
 * CONNECTED on subscribe; subsequent browser events (offline/online,
 * idle/userActivity) come from BrowserConnectionEventsAdapter and
 * are merged at the composition root.
 */
export class ConnectionEventsSimulator implements ConnectionEventsPort {
  events(): Observable<ConnectionEvent> {
    return of({ type: "gatewayConnected" });
  }
}
