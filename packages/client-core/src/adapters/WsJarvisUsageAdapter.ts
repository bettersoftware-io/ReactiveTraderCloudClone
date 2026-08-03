import { filter, Observable, switchMap } from "rxjs";

import type { JarvisUsageSnapshot } from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";

import type { IWsAdapter } from "./IWsAdapter";
import type { JarvisUsagePort } from "./jarvisUsagePort";

/** One connection's live `SERVER_MSG.ADMIN_JARVIS_USAGE` feed: registers the
 * handler, sends `admin.jarvisUsage.subscribe`, and forwards every push for
 * as long as this source stays subscribed. The server side
 * (`adminJarvisUsage.effects.ts`) sources this from a `BehaviorSubject`, so
 * a fresh subscribe always replays the current snapshot first — this
 * adapter itself stays a plain forwarder with no local caching. */
function createConnectionUsageStream(
  ws: IWsAdapter,
): Observable<JarvisUsageSnapshot> {
  return new Observable<JarvisUsageSnapshot>((subscriber) => {
    const unregister = ws.on(SERVER_MSG.ADMIN_JARVIS_USAGE, (payload) => {
      subscriber.next(payload as JarvisUsageSnapshot);
    });
    ws.send(CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE);

    return (): void => {
      unregister();
    };
  });
}

/** Wire-mode `JarvisUsagePort`: streams the rolling Jarvis usage/cost
 * snapshot (Admin surface) over an `IWsAdapter`.
 *
 * Mirrors `WsJarvisAdapter.availability$()`'s reconnect-re-arm shape: a
 * fresh `admin.jarvisUsage.subscribe` on every `gatewayConnected` event
 * (not just once at subscribe time), so a subscriber that outlives one
 * connection (the Admin usage panel) keeps receiving pushes across a
 * reconnect, including the one after a server restart — a subscribe sent on
 * a since-dropped socket reaches nobody. `switchMap` tears down the previous
 * connection's listener before arming the new one. */
export class WsJarvisUsageAdapter implements JarvisUsagePort {
  constructor(private readonly ws: IWsAdapter) {}

  usage$(): Observable<JarvisUsageSnapshot> {
    return this.ws.connectionEvents().pipe(
      filter((event) => {
        return event.type === "gatewayConnected";
      }),
      switchMap(() => {
        return createConnectionUsageStream(this.ws);
      }),
    );
  }
}
