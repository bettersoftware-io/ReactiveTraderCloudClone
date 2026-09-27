import type { ConnectionIntentsPort } from "@rtc/core-api";
import type { ConnectionEventsPort } from "@rtc/domain";

/** What `createFakeConnectionPorts` returns — exactly the two `AppPorts`
 * members `@rtc/core-api`'s `TransportPorts` omits together. */
export interface FakeConnectionPorts {
  connectionEvents: ConnectionEventsPort;
  connectionIntents: ConnectionIntentsPort;
}

/** Pairs an arbitrary `connectionEvents` fixture with an inert
 * `connectionIntents` — for a test that doesn't exercise reconnect/incident
 * behaviour at all and just needs SOME valid pair to satisfy `AppPorts`,
 * now that `@rtc/core-api`'s `TransportPorts` omits both members together
 * (ADR-006 Follow-up 5: a `TransportPorts` factory alone no longer supplies
 * either). A test that DOES care about reconnect/incident wiring uses
 * `pairConnectionPorts` (`./connectionIntents`) instead, which returns a
 * real, working pair. */
export function createFakeConnectionPorts(
  connectionEvents: ConnectionEventsPort,
): FakeConnectionPorts {
  return {
    connectionEvents,
    connectionIntents: {
      reconnect: () => {},
      injectIncident: () => {},
    },
  };
}
