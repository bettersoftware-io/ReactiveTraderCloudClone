// packages/client-react/src/app/adapters/WsConnectionEventsAdapter.ts

import type { ConnectionEvent, ConnectionEventsPort } from "@rtc/domain";
import type { Observable } from "rxjs";
import type { IWsAdapter } from "./IWsAdapter";

/**
 * ConnectionEventsPort backed by an IWsAdapter's lifecycle stream.
 * Used in WS-real mode; merged with BrowserConnectionEventsAdapter
 * at the composition root.
 */
export class WsConnectionEventsAdapter implements ConnectionEventsPort {
  constructor(private readonly ws: IWsAdapter) {}

  events(): Observable<ConnectionEvent> {
    return this.ws.connectionEvents();
  }
}
