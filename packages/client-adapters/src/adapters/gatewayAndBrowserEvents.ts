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
 * own subscribe-time event.
 *
 * Known limit: a socket that has died but not yet reported it still counts
 * as connected, so a `browserOnline` in that window shows `CONNECTED` until
 * the socket's own `gatewayDisconnected` arrives.
 */
export function mergeGatewayAndBrowserEvents(
  gateway$: Observable<ConnectionEvent>,
  browser$: Observable<ConnectionEvent>,
): Observable<ConnectionEvent> {
  return new Observable<ConnectionEvent>((subscriber) => {
    let gatewayIsConnected = false;
    let openSources = 2;

    // Like rxjs `merge`: complete once both sources have.
    function closeOneSource(): void {
      openSources -= 1;

      if (openSources === 0) {
        subscriber.complete();
      }
    }

    const gatewaySub = gateway$.subscribe({
      next: (event: ConnectionEvent): void => {
        gatewayIsConnected = event.type === "gatewayConnected";
        subscriber.next(event);
      },
      error: (error: unknown): void => {
        subscriber.error(error);
      },
      complete: closeOneSource,
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
      complete: closeOneSource,
    });

    return (): void => {
      gatewaySub.unsubscribe();
      browserSub.unsubscribe();
    };
  });
}
