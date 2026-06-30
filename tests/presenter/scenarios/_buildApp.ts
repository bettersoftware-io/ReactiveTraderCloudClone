// tests/presenter/scenarios/_buildApp.ts

import { merge, Subject, type Subscription } from "rxjs";

import {
  type App,
  type AppPorts,
  createApp,
  createSimulatorPorts,
} from "@rtc/client-react";
import { type ConnectionEvent, ConnectionEventsSimulator } from "@rtc/domain";

export interface PresenterCtx {
  app: App;
  connectionEvents$: Subject<ConnectionEvent>;
}

export function buildPresenterApp(): PresenterCtx {
  const connectionEvents$ = new Subject<ConnectionEvent>();
  const gateway = new ConnectionEventsSimulator();
  const ports: AppPorts = {
    ...createSimulatorPorts(),
    connectionEvents: {
      events: () => {
        return merge(gateway.events(), connectionEvents$.asObservable());
      },
    },
  };
  return { app: createApp(ports), connectionEvents$ };
}

/** What buildIncidentPresenterApp returns. */
export interface IncidentPresenterCtx {
  app: App;
  /**
   * Must be unsubscribed in the After hook — it is the reactive bridge that
   * translates IncidentMachine state transitions into myIncident$ emissions.
   */
  bridgeSub: Subscription;
}

/**
 * Builds a simulator-ports app whose connection events include a reactive
 * bridge driven by IncidentMachine.state$.
 *
 * Problem: composition.ts wires IncidentMachine → module-level incident$, but
 * that Subject is not exported. Calling buildDefaultPorts() would access
 * import.meta.env (Vite-only), which throws in Node.js/tsx.
 *
 * Solution: build a custom connectionEvents port with myIncident$, then
 * subscribe to app.presenters.incident.state$ and re-emit the equivalent
 * connection event whenever a disconnecting incident is injected or cleared.
 * The bridge fires synchronously, so status$ is already DISCONNECTED by the
 * time inject() returns — identical timing to the production path.
 */
export function buildIncidentPresenterApp(): IncidentPresenterCtx {
  // The IncidentMachine uses these kinds to push gatewayDisconnected.
  // Mirror the set from IncidentMachine.ts — string-valued, no const-enum.
  const DISCONNECTING_KINDS = new Set<string>(["latencySpike", "serviceDown"]);

  const myIncident$ = new Subject<ConnectionEvent>();
  const gateway = new ConnectionEventsSimulator();

  const ports: AppPorts = {
    ...createSimulatorPorts(),
    connectionEvents: {
      events: () => {
        return merge(gateway.events(), myIncident$.asObservable());
      },
    },
  };

  const app = createApp(ports);

  // Reactive bridge: IncidentMachine state$ → myIncident$
  let prevActive: readonly string[] = [];
  const bridgeSub: Subscription = app.presenters.incident.state$.subscribe(
    (state) => {
      const current = state.active as readonly string[];

      for (const kind of current) {
        if (!prevActive.includes(kind) && DISCONNECTING_KINDS.has(kind)) {
          myIncident$.next({ type: "gatewayDisconnected" });
        }
      }

      if (current.length === 0 && prevActive.length > 0) {
        myIncident$.next({ type: "gatewayConnected" });
      }

      prevActive = current;
    },
  );

  return { app, bridgeSub };
}
