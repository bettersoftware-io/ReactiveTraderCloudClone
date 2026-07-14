import type { Observable } from "rxjs";

import type { AppToInspector, InspectorToApp } from "./protocol";

/** App-side transport port. The hub derives liveness from hello/ping/bye —
 * no status$ needed. Adapters: BroadcastChannel (Task 3), WebSocket relay (future). */
export interface DevtoolsTransport {
  send(msg: AppToInspector): void;
  inbound$: Observable<InspectorToApp>;
  dispose(): void;
}
