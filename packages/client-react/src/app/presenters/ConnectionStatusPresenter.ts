import { type Observable, shareReplay } from "rxjs";
import {
  ConnectionStatus,
  ConnectionStatusUseCase,
  type ConnectionEventsPort,
} from "@rtc/domain";

export class ConnectionStatusPresenter {
  readonly status$: Observable<ConnectionStatus>;
  constructor(
    events: ConnectionEventsPort,
    initial: ConnectionStatus = ConnectionStatus.CONNECTING,
  ) {
    this.status$ = new ConnectionStatusUseCase(events, initial).execute().pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
