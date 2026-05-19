// tests/scenarios/presenter/_buildApp.ts
import { merge, Subject } from "rxjs";
import {
  ConnectionEventsSimulator,
  type ConnectionEvent,
} from "@rtc/domain";
import {
  createApp,
  createSimulatorPorts,
  type App,
  type AppPorts,
} from "@rtc/client";

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
      events: () => merge(gateway.events(), connectionEvents$.asObservable()),
    },
  };
  return { app: createApp(ports), connectionEvents$ };
}
