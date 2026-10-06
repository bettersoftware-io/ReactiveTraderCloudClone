import { ReplaySubject, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type ConnectionEvent,
  ConnectionStatus,
  nextConnectionStatus,
} from "@rtc/domain";

import { mergeGatewayAndBrowserEvents } from "./gatewayAndBrowserEvents";

describe("mergeGatewayAndBrowserEvents", () => {
  it("passes both sources through in the order they emit", () => {
    const { gateway$, browser$, seen } = createMerged();

    gateway$.next({ type: "gatewayConnected" });
    browser$.next({ type: "userActivity" });
    gateway$.next({ type: "gatewayDisconnected" });

    expect(seen).toEqual([
      { type: "gatewayConnected" },
      { type: "userActivity" },
      { type: "gatewayDisconnected" },
    ]);
  });

  it("repeats gatewayConnected on browserOnline when the socket never dropped", () => {
    const { gateway$, browser$, seen } = createMerged();

    gateway$.next({ type: "gatewayConnected" });
    browser$.next({ type: "browserOffline" });
    browser$.next({ type: "browserOnline" });

    expect(seen.slice(2)).toEqual([
      { type: "browserOnline" },
      { type: "gatewayConnected" },
    ]);
    // What the repeat is for: the status the user sees.
    expect(statusAfter(seen)).toBe(ConnectionStatus.CONNECTED);
  });

  it("adds nothing on browserOnline when the socket dropped: the gateway reports its own recovery", () => {
    const { gateway$, browser$, seen } = createMerged();

    gateway$.next({ type: "gatewayConnected" });
    browser$.next({ type: "browserOffline" });
    gateway$.next({ type: "gatewayDisconnected" });
    browser$.next({ type: "browserOnline" });

    expect(seen.at(-1)).toEqual({ type: "browserOnline" });
    expect(statusAfter(seen)).toBe(ConnectionStatus.CONNECTING);
  });

  it("adds nothing on browserOnline before the gateway ever connected", () => {
    const { browser$, seen } = createMerged();

    browser$.next({ type: "browserOnline" });

    expect(seen).toEqual([{ type: "browserOnline" }]);
  });

  it("knows the gateway's replayed state before the browser's subscribe-time event", () => {
    // A core swapped in while offline: the gateway replays its last event
    // and the browser adapter reports `browserOffline` as it is subscribed.
    const gateway$ = new ReplaySubject<ConnectionEvent>(1);
    const browser$ = new ReplaySubject<ConnectionEvent>(1);
    gateway$.next({ type: "gatewayConnected" });
    browser$.next({ type: "browserOffline" });

    const seen: ConnectionEvent[] = [];
    mergeGatewayAndBrowserEvents(gateway$, browser$).subscribe((event) => {
      seen.push(event);
    });
    browser$.next({ type: "browserOnline" });

    expect(seen).toEqual([
      { type: "gatewayConnected" },
      { type: "browserOffline" },
      { type: "browserOnline" },
      { type: "gatewayConnected" },
    ]);
  });

  it("releases both sources when unsubscribed", () => {
    const gateway$ = new Subject<ConnectionEvent>();
    const browser$ = new Subject<ConnectionEvent>();
    const sub = mergeGatewayAndBrowserEvents(gateway$, browser$).subscribe();

    sub.unsubscribe();

    expect(gateway$.observed).toBe(false);
    expect(browser$.observed).toBe(false);
  });
});

interface Merged {
  gateway$: Subject<ConnectionEvent>;
  browser$: Subject<ConnectionEvent>;
  seen: ConnectionEvent[];
}

function createMerged(): Merged {
  const gateway$ = new Subject<ConnectionEvent>();
  const browser$ = new Subject<ConnectionEvent>();
  const seen: ConnectionEvent[] = [];

  mergeGatewayAndBrowserEvents(gateway$, browser$).subscribe((event) => {
    seen.push(event);
  });

  return { gateway$, browser$, seen };
}

/** The status the connection reducer reaches from CONNECTING over `events`. */
function statusAfter(events: readonly ConnectionEvent[]): ConnectionStatus {
  return events.reduce(nextConnectionStatus, ConnectionStatus.CONNECTING);
}
