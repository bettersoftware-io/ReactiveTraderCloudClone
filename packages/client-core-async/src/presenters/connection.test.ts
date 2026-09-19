import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import { type ConnectionEvent, ConnectionStatus } from "@rtc/domain";

import { createConnectionPresenter } from "#/presenters/connection";

describe("createConnectionPresenter (async)", () => {
  it("publishes every fold result, including one an ignored event leaves unchanged (scan parity with the RxJS core)", () => {
    const events = new Subject<ConnectionEvent>();
    const presenter = createConnectionPresenter({
      events: () => {
        return events;
      },
    });
    const seen: ConnectionStatus[] = [];
    const sub = presenter.status$.subscribe((s) => {
      seen.push(s);
    });
    events.next({ type: "gatewayConnected" });
    events.next({ type: "userActivity" });
    expect(seen).toEqual([
      ConnectionStatus.CONNECTING,
      ConnectionStatus.CONNECTED,
      ConnectionStatus.CONNECTED,
    ]);
    sub.unsubscribe();
    expect(events.observed).toBe(false);
  });

  it("surfaces a port error as a stream error", () => {
    const events = new Subject<ConnectionEvent>();
    const presenter = createConnectionPresenter({
      events: () => {
        return events;
      },
    });
    const errors: unknown[] = [];
    presenter.status$.subscribe({
      next: () => {},
      error: (e: unknown) => {
        errors.push(e);
      },
    });
    events.error(new Error("socket"));
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(errors).toHaveLength(1);
        resolve();
      }, 0);
    });
  });

  it("calls events.events() once, across two warm periods", () => {
    let calls = 0;
    const events = new Subject<ConnectionEvent>();
    const presenter = createConnectionPresenter({
      events: () => {
        calls += 1;
        return events;
      },
    });
    const sub = presenter.status$.subscribe(() => {});
    sub.unsubscribe();
    const subAgain = presenter.status$.subscribe(() => {});
    expect(calls).toBe(1);
    expect(events.observed).toBe(true);
    subAgain.unsubscribe();
  });
});
