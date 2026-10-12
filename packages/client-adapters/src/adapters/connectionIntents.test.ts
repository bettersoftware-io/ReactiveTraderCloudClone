import { NEVER, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { ConnectionEvent } from "@rtc/domain";

import { pairConnectionPorts } from "./connectionIntents";

describe("pairConnectionPorts", () => {
  it("merges reconnect() and injectIncident() into connectionEvents alongside the source events", () => {
    const source$ = new Subject<ConnectionEvent>();
    const { connectionEvents, connectionIntents } = pairConnectionPorts(
      source$.asObservable(),
    );
    const seen: ConnectionEvent[] = [];
    const sub = connectionEvents.events().subscribe((event) => {
      seen.push(event);
    });

    source$.next({ type: "gatewayConnected" });
    connectionIntents.reconnect();
    connectionIntents.injectIncident({ type: "idleTimeout" });

    expect(seen).toEqual([
      { type: "gatewayConnected" },
      { type: "reconnect" },
      { type: "idleTimeout" },
    ]);

    sub.unsubscribe();
  });

  it("defaults to rendering reconnect() as the raw intent only (both ws-real branches)", () => {
    const { connectionEvents, connectionIntents } = pairConnectionPorts(NEVER);
    const seen: ConnectionEvent[] = [];
    const sub = connectionEvents.events().subscribe((event) => {
      seen.push(event);
    });

    connectionIntents.reconnect();

    expect(seen).toEqual([{ type: "reconnect" }]);

    sub.unsubscribe();
  });

  it("renders reconnect() as intent-then-connected, IN THAT ORDER (web simulator branches)", () => {
    const { connectionEvents, connectionIntents } = pairConnectionPorts(NEVER, {
      reconnectRendering: "intent-then-connected",
    });
    const seen: ConnectionEvent[] = [];
    const sub = connectionEvents.events().subscribe((event) => {
      seen.push(event);
    });

    connectionIntents.reconnect();

    // Order matters: the connection-status fold reads IDLE_DISCONNECTED →
    // CONNECTING off the reconnect intent, then CONNECTING → CONNECTED off
    // gatewayConnected. Swapped, the machine never leaves CONNECTING.
    expect(seen).toEqual([{ type: "reconnect" }, { type: "gatewayConnected" }]);

    sub.unsubscribe();
  });

  it("renders reconnect() as connected-only, with NO raw intent (RN simulator branch)", () => {
    const { connectionEvents, connectionIntents } = pairConnectionPorts(NEVER, {
      reconnectRendering: "connected-only",
    });
    const seen: ConnectionEvent[] = [];
    const sub = connectionEvents.events().subscribe((event) => {
      seen.push(event);
    });

    connectionIntents.reconnect();

    expect(seen).toEqual([{ type: "gatewayConnected" }]);

    sub.unsubscribe();
  });

  it("still merges injectIncident() in unmodified regardless of reconnectRendering", () => {
    const { connectionEvents, connectionIntents } = pairConnectionPorts(NEVER, {
      reconnectRendering: "connected-only",
    });
    const seen: ConnectionEvent[] = [];
    const sub = connectionEvents.events().subscribe((event) => {
      seen.push(event);
    });

    connectionIntents.injectIncident({ type: "idleTimeout" });

    expect(seen).toEqual([{ type: "idleTimeout" }]);

    sub.unsubscribe();
  });

  it("keeps two pairs from two calls from leaking into each other", () => {
    const pairA = pairConnectionPorts(NEVER);
    const pairB = pairConnectionPorts(NEVER);
    const seenA: ConnectionEvent[] = [];
    const seenB: ConnectionEvent[] = [];
    const subA = pairA.connectionEvents.events().subscribe((event) => {
      seenA.push(event);
    });

    const subB = pairB.connectionEvents.events().subscribe((event) => {
      seenB.push(event);
    });

    pairA.connectionIntents.reconnect();
    pairB.connectionIntents.injectIncident({ type: "idleTimeout" });

    expect(seenA).toEqual([{ type: "reconnect" }]);
    expect(seenB).toEqual([{ type: "idleTimeout" }]);

    subA.unsubscribe();
    subB.unsubscribe();
  });
});
