// tests/scenarios/presenter/_buildApp.ts
import { Subject } from "rxjs";
import {
  createApp,
  createSimulatorPorts,
  withSyntheticGatewayConnected,
  type App,
  type AppPorts,
} from "@rtc/client";
import type { ConnectionEvent } from "@rtc/domain";

export interface PresenterCtx {
  app: App;
  connectionEvents$: Subject<ConnectionEvent>;
}

export function buildPresenterApp(): PresenterCtx {
  const connectionEvents$ = new Subject<ConnectionEvent>();
  const ports: AppPorts = {
    ...createSimulatorPorts(),
    connectionEvents: withSyntheticGatewayConnected({
      events: () => connectionEvents$.asObservable(),
    }),
  };
  return { app: createApp(ports), connectionEvents$ };
}
