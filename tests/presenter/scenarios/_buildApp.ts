// tests/presenter/scenarios/_buildApp.ts

import { merge, Subject } from "rxjs";

import {
  type App,
  type AppPorts,
  type ConnectionIntentsPort,
  createApp,
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-core";
import {
  AuthSimulator,
  type ConnectionEvent,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";

export interface PresenterCtx {
  app: App;
  connectionEvents$: Subject<ConnectionEvent>;
}

export function buildPresenterApp(): PresenterCtx {
  const connectionEvents$ = new Subject<ConnectionEvent>();
  const gateway = new ConnectionEventsSimulator();
  const ports: AppPorts = {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      // No presenter scenario drives login/lock — AuthSimulator with no dev
      // credentials and a fresh in-memory store are inert stand-ins that
      // satisfy PortFactoryDeps.
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: {
      events: () => {
        return merge(gateway.events(), connectionEvents$.asObservable());
      },
    },
    connectionIntents: createConnectionIntents(connectionEvents$),
  };
  return { app: createApp(ports), connectionEvents$ };
}

/** What buildIncidentPresenterApp returns. */
export interface IncidentPresenterCtx {
  app: App;
}

/**
 * Builds a simulator-ports app whose admin incident injections reach its own
 * connection presenter — the production path: `presenters.incident` pushes
 * each connection event through `ports.connectionIntents`, which this
 * builder merges into `connectionEvents`, as a client's port builder does.
 * Instance-scoped (no module-level Subject is shared between scenarios), and
 * free of `buildBrowserPorts()`, which reads `import.meta.env` (Vite-only)
 * and throws in Node.js/tsx. The push is synchronous, so `status$` is already
 * DISCONNECTED by the time `inject()` returns.
 */
export function buildIncidentPresenterApp(): IncidentPresenterCtx {
  const intents$ = new Subject<ConnectionEvent>();
  const gateway = new ConnectionEventsSimulator();

  const ports: AppPorts = {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: {
      events: () => {
        return merge(gateway.events(), intents$.asObservable());
      },
    },
    connectionIntents: createConnectionIntents(intents$),
  };

  return { app: createApp(ports) };
}

/** A `ConnectionIntentsPort` that pushes into `sink` — the Subject the
 * builder's `connectionEvents` merges. */
function createConnectionIntents(
  sink: Subject<ConnectionEvent>,
): ConnectionIntentsPort {
  return {
    reconnect: () => {
      sink.next({ type: "reconnect" });
    },
    injectIncident: (event: ConnectionEvent) => {
      sink.next(event);
    },
  };
}
