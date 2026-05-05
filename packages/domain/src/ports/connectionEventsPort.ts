import type { Observable } from "rxjs";
import type { ConnectionEvent } from "../connection/connectionStatus.js";

export interface ConnectionEventsPort {
  events(): Observable<ConnectionEvent>;
}
