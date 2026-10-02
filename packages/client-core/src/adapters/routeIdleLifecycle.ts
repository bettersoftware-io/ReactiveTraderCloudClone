import type { ConnectionEvent } from "@rtc/domain";

import type { IWsAdapter } from "#/adapters/IWsAdapter";

/** Routes idle-lifecycle events to the WS adapter. Exported so the wiring is
 * directly testable (idleTeardown.test.ts). Lives beside the adapters, not
 * in the composition root: the web clients call it from `buildBrowserPorts`
 * (eagerly), and anything the eager graph reaches in `composition.ts` drags
 * the whole RxJS composition root into the entry bundle.
 * - idleTimeout  → closeForIdle() (suppresses auto-reconnect)
 * - reconnect    → reopen()       (sole recovery from idle; button-only)
 * - userActivity → no-op here     (resets countdown in BrowserConnectionEventsAdapter
 *                                   only; does NOT reopen the socket)
 * Provenance: original services/connection.ts:74-96. */
export function routeIdleLifecycle(
  event: ConnectionEvent,
  ws: Pick<IWsAdapter, "closeForIdle" | "reopen">,
): void {
  if (event.type === "idleTimeout") {
    ws.closeForIdle();
  } else if (event.type === "reconnect") {
    ws.reopen();
  }
}
