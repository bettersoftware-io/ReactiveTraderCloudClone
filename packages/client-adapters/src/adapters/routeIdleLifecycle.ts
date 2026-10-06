import type { IWsAdapter } from "@rtc/core-api";
import type { ConnectionEvent } from "@rtc/domain";

/** Routes idle-lifecycle events to the WS adapter. Exported so the wiring is
 * directly testable (idleTeardown.test.ts). Lives beside the adapters, not
 * in the composition root: the web clients call it from `buildBrowserPorts`
 * (eagerly), and anything the eager graph reaches in `composition.ts` drags
 * the whole RxJS composition root into the entry bundle.
 * - idleTimeout  → closeForIdle() (suppresses auto-reconnect)
 * - reconnect    → reopen()       (the Reconnect button)
 * - browserOnline → reopen()      (the status leaves OFFLINE for CONNECTING
 *                                   and nothing else would reopen a socket
 *                                   closed for idle before or during the
 *                                   outage; a no-op on any other socket)
 * - userActivity → no-op here     (resets countdown in BrowserConnectionEventsAdapter
 *                                   only; does NOT reopen the socket)
 * Provenance: original services/connection.ts:74-96. */
export function routeIdleLifecycle(
  event: ConnectionEvent,
  ws: Pick<IWsAdapter, "closeForIdle" | "reopen">,
): void {
  if (event.type === "idleTimeout") {
    ws.closeForIdle();
  } else if (event.type === "reconnect" || event.type === "browserOnline") {
    ws.reopen();
  }
}
