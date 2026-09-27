import { map, merge, mergeMap, type Observable, of, Subject } from "rxjs";

import type { ConnectionIntentsPort } from "@rtc/core-api";
import type { ConnectionEvent, ConnectionEventsPort } from "@rtc/domain";

/** The reconnect-intent event emitted from the Reconnect button. */
export interface ReconnectIntent {
  type: "reconnect";
}

/**
 * How a `reconnect()` call renders into `connectionEvents` — the one
 * per-branch difference `pairConnectionPorts` still lets a caller choose:
 * a real gateway reports its own recovery once the socket is back up, but a
 * branch with no real gateway (a simulator) must synthesize one. Every
 * other event (the `events$` a caller merges in, and `injectIncident`) is
 * merged in unmodified regardless of this choice.
 */
export type ReconnectRendering =
  /** The raw `{ type: "reconnect" }` intent only — both ws-real branches
   * (`buildBrowserPorts`, `buildNativePorts`), whose real gateway reports
   * `gatewayConnected` itself once the socket reopens. */
  | "intent"
  /** The raw intent, immediately followed by a synthesized
   * `gatewayConnected` — the web clients' (react, solid) simulator
   * branches, which have no real gateway to report recovery. */
  | "intent-then-connected"
  /** ONLY a synthesized `gatewayConnected`, no raw intent — the RN
   * simulator branch, kept exactly as it already behaved before this
   * helper existed. Its ws-real twin uses `"intent"`. */
  | "connected-only";

export interface PairConnectionPortsOptions {
  /** @default "intent" */
  reconnectRendering?: ReconnectRendering;
}

/** What `pairConnectionPorts` returns: exactly the two `AppPorts` members
 * `@rtc/core-api`'s `TransportPorts` omits together (ADR-006 Follow-up 5) —
 * spread this straight into an `AppPorts` literal alongside a
 * `TransportPorts` factory's spread (`...createXPorts(deps),
 * ...pairConnectionPorts(events$)`), and a builder that supplies one member
 * without the other fails to typecheck. */
export interface PairedConnectionPorts {
  connectionEvents: ConnectionEventsPort;
  connectionIntents: ConnectionIntentsPort;
}

/**
 * Builds one instance-scoped `connectionIntents`/`connectionEvents` pair:
 * `commands.reconnect` and the admin incident injection push into Subjects
 * private to THIS call, merged into the `events$` a caller supplies (a real
 * gateway's events, a simulator's, or both plus browser lifecycle events —
 * see each branch in `buildBrowserPorts`/`buildNativePorts`). Every call
 * gets its OWN Subjects, so two pairs from two calls never leak into each
 * other. This is the only producer of the pair in `@rtc/client-core` — a
 * core reaches it only through `ports.connectionIntents`/`connectionEvents`,
 * never a module-level Subject.
 */
export function pairConnectionPorts(
  events$: Observable<ConnectionEvent>,
  options: PairConnectionPortsOptions = {},
): PairedConnectionPorts {
  const reconnect$ = new Subject<ReconnectIntent>();
  const incident$ = new Subject<ConnectionEvent>();
  const renderedReconnect$ = renderReconnect(
    reconnect$,
    options.reconnectRendering ?? "intent",
  );
  const merged$ = merge(events$, renderedReconnect$, incident$);

  return {
    connectionEvents: {
      events: () => {
        return merged$;
      },
    },
    connectionIntents: {
      reconnect: () => {
        reconnect$.next({ type: "reconnect" });
      },
      injectIncident: (event: ConnectionEvent) => {
        incident$.next(event);
      },
    },
  };
}

/** Renders the raw reconnect Subject into the events it contributes to the
 * merge, per `ReconnectRendering`. Kept as its own function so each mode's
 * shape (and the order the two-event modes emit in) is one readable branch,
 * not buried inline in `pairConnectionPorts`. */
function renderReconnect(
  reconnect$: Observable<ReconnectIntent>,
  rendering: ReconnectRendering,
): Observable<ConnectionEvent> {
  switch (rendering) {
    case "intent":
      return reconnect$;
    case "intent-then-connected":
      return reconnect$.pipe(
        mergeMap(() => {
          return of(
            { type: "reconnect" as const },
            { type: "gatewayConnected" as const },
          );
        }),
      );
    case "connected-only":
      return reconnect$.pipe(
        map(() => {
          return { type: "gatewayConnected" as const };
        }),
      );
  }
}
