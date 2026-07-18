import { firstValueFrom, of, Subject, toArray } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type ConnectionEvent,
  ConnectionStatus,
} from "../connection/connectionStatus.js";
import type { ConnectionEventsPort } from "../ports/connectionEventsPort.js";
import { ConnectionStatusUseCase } from "./ConnectionStatusUseCase.js";

describe("ConnectionStatusUseCase", () => {
  it("emits the initial status synchronously when there are no events", async () => {
    const port: ConnectionEventsPort = {
      events: () => {
        return of();
      },
    };
    const useCase = new ConnectionStatusUseCase(port);
    const emissions = await firstValueFrom(useCase.execute().pipe(toArray()));
    expect(emissions).toEqual([ConnectionStatus.CONNECTING]);
  });

  it("folds events through nextConnectionStatus", async () => {
    // Recovery from IDLE_DISCONNECTED is button-only: a reconnect intent (not
    // userActivity) drives the fold back to CONNECTING. See connectionStatus.ts.
    const port = portFrom([
      { type: "gatewayConnected" },
      { type: "idleTimeout" },
      { type: "reconnect" },
    ]);
    const useCase = new ConnectionStatusUseCase(port);
    const emissions = await firstValueFrom(useCase.execute().pipe(toArray()));
    expect(emissions).toEqual([
      ConnectionStatus.CONNECTING,
      ConnectionStatus.CONNECTED,
      ConnectionStatus.IDLE_DISCONNECTED,
      ConnectionStatus.CONNECTING,
    ]);
  });

  it("uses the explicit initial status when provided", async () => {
    const port: ConnectionEventsPort = {
      events: () => {
        return of();
      },
    };

    const useCase = new ConnectionStatusUseCase(
      port,
      ConnectionStatus.CONNECTED,
    );
    const first = await firstValueFrom(useCase.execute());
    expect(first).toBe(ConnectionStatus.CONNECTED);
  });

  it("emits live updates from a hot event stream", () => {
    const subject = new Subject<ConnectionEvent>();
    const port: ConnectionEventsPort = {
      events: () => {
        return subject.asObservable();
      },
    };

    const useCase = new ConnectionStatusUseCase(
      port,
      ConnectionStatus.CONNECTED,
    );
    const seen: ConnectionStatus[] = [];
    const sub = useCase.execute().subscribe((s) => {
      return seen.push(s);
    });
    subject.next({ type: "gatewayDisconnected" });
    subject.next({ type: "browserOffline" });
    sub.unsubscribe();
    expect(seen).toEqual([
      ConnectionStatus.CONNECTED,
      ConnectionStatus.DISCONNECTED,
      ConnectionStatus.OFFLINE_DISCONNECTED,
    ]);
  });
});

function portFrom(events: readonly ConnectionEvent[]): ConnectionEventsPort {
  return {
    events: () => {
      return of(...events);
    },
  };
}
