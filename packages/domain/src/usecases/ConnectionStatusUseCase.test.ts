import { firstValueFrom, of, Subject, toArray } from "rxjs";
import { describe, expect, it } from "vitest";
import {
  type ConnectionEvent,
  ConnectionStatus,
} from "../connection/connectionStatus.js";
import type { ConnectionEventsPort } from "../ports/connectionEventsPort.js";
import { ConnectionStatusUseCase } from "./ConnectionStatusUseCase.js";

function portFrom(events: readonly ConnectionEvent[]): ConnectionEventsPort {
  return { events: () => of(...events) };
}

describe("ConnectionStatusUseCase", () => {
  it("emits the initial status synchronously when there are no events", async () => {
    const port: ConnectionEventsPort = { events: () => of() };
    const useCase = new ConnectionStatusUseCase(port);
    const emissions = await firstValueFrom(useCase.execute().pipe(toArray()));
    expect(emissions).toEqual([ConnectionStatus.CONNECTING]);
  });

  it("folds events through nextConnectionStatus", async () => {
    const port = portFrom([
      { type: "gatewayConnected" },
      { type: "idleTimeout" },
      { type: "userActivity" },
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
    const port: ConnectionEventsPort = { events: () => of() };
    const useCase = new ConnectionStatusUseCase(
      port,
      ConnectionStatus.CONNECTED,
    );
    const first = await firstValueFrom(useCase.execute());
    expect(first).toBe(ConnectionStatus.CONNECTED);
  });

  it("emits live updates from a hot event stream", () => {
    const subject = new Subject<ConnectionEvent>();
    const port: ConnectionEventsPort = { events: () => subject.asObservable() };
    const useCase = new ConnectionStatusUseCase(
      port,
      ConnectionStatus.CONNECTED,
    );
    const seen: ConnectionStatus[] = [];
    const sub = useCase.execute().subscribe((s) => seen.push(s));
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
