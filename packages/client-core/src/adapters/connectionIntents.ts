import { Subject } from "rxjs";

import type { ConnectionIntentsPort } from "@rtc/core-api";
import type { ConnectionEvent } from "@rtc/domain";

/** The reconnect-intent event emitted from the Reconnect button. */
interface ReconnectIntent {
  type: "reconnect";
}

/**
 * The user's reconnect intents (`commands.reconnect`). Every client's port
 * builder merges it into `connectionEvents` — each in its own way (the
 * simulator branches follow it with a simulated `gatewayConnected`).
 */
export const reconnect$ = new Subject<ReconnectIntent>();

/**
 * The admin incident machine's connection events (`presenters.incident`),
 * merged into `connectionEvents` by every client's port builder beside
 * `reconnect$`.
 */
export const incident$ = new Subject<ConnectionEvent>();

/** The client-side `AppPorts.connectionIntents`, backed by the two Subjects
 * above. Both port factories supply it, so a builder that merges the
 * Subjects into its `connectionEvents` gets a working pair; a core pushes
 * through its ports and never imports a module-level Subject. */
export const connectionIntentsPort: ConnectionIntentsPort = {
  reconnect: () => {
    reconnect$.next({ type: "reconnect" });
  },
  injectIncident: (event: ConnectionEvent) => {
    incident$.next(event);
  },
};
