import { type Observable, scan, startWith } from "rxjs";
import {
  type ConnectionEvent,
  ConnectionStatus,
  nextConnectionStatus,
} from "../connection/connectionStatus.js";
import type { ConnectionEventsPort } from "../ports/connectionEventsPort.js";

export class ConnectionStatusUseCase {
  constructor(
    private readonly events: ConnectionEventsPort,
    private readonly initial: ConnectionStatus = ConnectionStatus.CONNECTING,
  ) {}

  execute(): Observable<ConnectionStatus> {
    return this.events.events().pipe(
      scan(
        (state: ConnectionStatus, event: ConnectionEvent) =>
          nextConnectionStatus(state, event),
        this.initial,
      ),
      startWith(this.initial),
    );
  }
}
