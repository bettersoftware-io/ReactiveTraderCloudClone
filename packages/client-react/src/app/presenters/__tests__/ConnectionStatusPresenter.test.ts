import {
  type ConnectionEvent,
  type ConnectionEventsPort,
  ConnectionStatus,
} from "@rtc/domain";
import { firstValueFrom, of, Subject, toArray } from "rxjs";
import { describe, expect, it } from "vitest";
import { ConnectionStatusPresenter } from "../ConnectionStatusPresenter";

describe("ConnectionStatusPresenter", () => {
  it("exposes the connection status stream", async () => {
    const port: ConnectionEventsPort = {
      events: () => of<ConnectionEvent>({ type: "gatewayConnected" }),
    };
    const all = await firstValueFrom(
      new ConnectionStatusPresenter(port).status$.pipe(toArray()),
    );
    expect(all).toEqual([
      ConnectionStatus.CONNECTING,
      ConnectionStatus.CONNECTED,
    ]);
  });

  it("multicasts the same value to multiple subscribers", () => {
    const subject = new Subject<ConnectionEvent>();
    const presenter = new ConnectionStatusPresenter(
      { events: () => subject.asObservable() },
      ConnectionStatus.CONNECTED,
    );
    const a: ConnectionStatus[] = [];
    const b: ConnectionStatus[] = [];
    const subA = presenter.status$.subscribe((s) => a.push(s));
    const subB = presenter.status$.subscribe((s) => b.push(s));
    subject.next({ type: "gatewayDisconnected" });
    subA.unsubscribe();
    subB.unsubscribe();
    expect(a).toEqual(b);
    expect(a).toEqual([
      ConnectionStatus.CONNECTED,
      ConnectionStatus.DISCONNECTED,
    ]);
  });
});
