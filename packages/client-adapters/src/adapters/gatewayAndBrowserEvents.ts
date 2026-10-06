import { Observable } from "rxjs";

import type { ConnectionEvent } from "@rtc/domain";

/**
 * Merges a real gateway's events with the browser's, for a ws-real branch.
 *
 * The one thing it adds: when the browser reports it is back online and the
 * gateway's last word was `gatewayConnected`, that word is repeated. The
 * connection reducer leaves `OFFLINE_DISCONNECTED` for `CONNECTING` on
 * `browserOnline` and then waits for the gateway. A socket that dropped
 * while offline reconnects and says so; a socket that never dropped (a
 * server on this machine) has nothing new to say, and the status would sit
 * on `CONNECTING` until the socket next cycled.
 *
 * The gateway is subscribed first, so what it replays on subscribe (the
 * `WsAdapter` keeps its last event) is known before the browser adapter's
 * own subscribe-time `browserOffline`.
 */
export function mergeGatewayAndBrowserEvents(
  gateway$: Observable<ConnectionEvent>,
  browser$: Observable<ConnectionEvent>,
): Observable<ConnectionEvent> {
  return new Observable<ConnectionEvent>((subscriber) => {
    let gatewayIsConnected = false;

    const gatewaySub = gateway$.subscribe({
      next: (event: ConnectionEvent): void => {
        gatewayIsConnected = event.type === "gatewayConnected";
        subscriber.next(event);
      },
      error: (error: unknown): void => {
        subscriber.error(error);
      },
    });

    const browserSub = browser$.subscribe({
      next: (event: ConnectionEvent): void => {
        subscriber.next(event);

        if (event.type === "browserOnline" && gatewayIsConnected) {
          subscriber.next({ type: "gatewayConnected" });
        }
      },
      error: (error: unknown): void => {
        subscriber.error(error);
      },
    });

    return (): void => {
      gatewaySub.unsubscribe();
      browserSub.unsubscribe();
    };
  });
}
