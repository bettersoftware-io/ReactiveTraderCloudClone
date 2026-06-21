// tests/presenter/scenarios/_buildApp.ts

import {
  type App,
  type AppPorts,
  createApp,
  createSimulatorPorts,
} from "@rtc/client-react";
import { type ConnectionEvent, ConnectionEventsSimulator } from "@rtc/domain";
import { merge, Subject } from "rxjs";

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
