import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "@rtc/client-core";
import {
  type ConnectionEvent,
  ConnectionStatus,
  nextConnectionStatus,
} from "@rtc/domain";

import { LocalStoragePreferencesAdapter } from "#/app/adapters/LocalStoragePreferencesAdapter";
import { buildBrowserPorts } from "#/app/buildBrowserPorts";

// No VITE_SERVER_URL configured in vitest → simulator branch is always taken.
describe("buildBrowserPorts (simulator branch)", () => {
  it("returns a LocalStoragePreferencesAdapter as preferences", () => {
    const ports = buildBrowserPorts();
    expect(ports.preferences).toBeInstanceOf(LocalStoragePreferencesAdapter);
  });

  it("returns a connectionEvents port with an events() function", () => {
    const ports = buildBrowserPorts();
    expect(typeof ports.connectionEvents.events).toBe("function");
  });

  // The seam test that would have caught the dead Reconnect button: the real
  // ports' merged event stream, the real reconnect command, and the real
  // domain reducer — no fakes on the seam under test. The old mapping emitted
  // only gatewayConnected, which IDLE_DISCONNECTED discards, so the fold
  // stayed stuck in IDLE_DISCONNECTED.
  it("reconnect command recovers the reducer from IDLE_DISCONNECTED to CONNECTED", () => {
    const ports = buildBrowserPorts();
    const app = createApp(ports);
    const seen: ConnectionEvent[] = [];
    const sub = ports.connectionEvents.events().subscribe((e) => {
      seen.push(e);
    });
    app.commands.reconnect();
    sub.unsubscribe();

    const statusTrail = [];
    let status = ConnectionStatus.IDLE_DISCONNECTED;

    for (const event of seen) {
      status = nextConnectionStatus(status, event);
      statusTrail.push(status);
    }

    // reconnect → CONNECTING must precede gatewayConnected → CONNECTED.
    expect(statusTrail).toContain(ConnectionStatus.CONNECTING);
    expect(status).toBe(ConnectionStatus.CONNECTED);
  });
});

// The dev-only NarratorMachine threshold seam (Task 9): `import.meta.env.DEV`
// is `true` under vitest (unset MODE defaults away from "production"), so
// only the `?narratorThresholds=test` query param varies here — the DEV
// half of the gate is exercised structurally (this file couldn't run at all
// under a real production build, where the whole branch is compiled away).
describe("buildBrowserPorts — narratorConfig (dev-only ?narratorThresholds=test seam)", () => {
  afterEach(() => {
    setSearch("");
  });

  it("omits narratorConfig when the query param is absent", () => {
    setSearch("");
    const ports = buildBrowserPorts();
    expect(ports.narratorConfig).toBeUndefined();
  });

  it("omits narratorConfig for an unrelated query param", () => {
    setSearch("?foo=1");
    const ports = buildBrowserPorts();
    expect(ports.narratorConfig).toBeUndefined();
  });

  it("supplies the relaxed detector thresholds when ?narratorThresholds=test is present", () => {
    setSearch("?narratorThresholds=test");
    const ports = buildBrowserPorts();
    expect(ports.narratorConfig).toEqual({
      windowSize: 8,
      minWindowFill: 4,
      spreadSigma: 0.1,
      volSigma: 0.1,
    });
  });

  it("omits narratorConfig for a near-miss value", () => {
    setSearch("?narratorThresholds=production");
    const ports = buildBrowserPorts();
    expect(ports.narratorConfig).toBeUndefined();
  });
});

/** Drive window.location.search via the History API (jsdom-supported) —
 * same idiom as `@rtc/boot-splash`'s `bootSplashGate.test.ts`. */
function setSearch(search: string): void {
  window.history.replaceState({}, "", `/${search}`);
}
