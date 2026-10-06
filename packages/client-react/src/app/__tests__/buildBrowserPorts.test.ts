import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "@rtc/client-core-rxjs";
import {
  type ConnectionEvent,
  ConnectionStatus,
  nextConnectionStatus,
} from "@rtc/domain";
import { LocalStoragePreferencesAdapter } from "@rtc/web-boot";

import { buildBrowserPorts } from "#/app/buildBrowserPorts";

// No VITE_SERVER_URL configured in vitest → simulator branch is always taken.
describe("buildBrowserPorts (simulator branch)", () => {
  it("returns a LocalStoragePreferencesAdapter as preferences", () => {
    const ports = buildBrowserPorts();
    expect(ports.preferences).toBeInstanceOf(LocalStoragePreferencesAdapter);
  });

  // The simulator branch rewrites the browser lifecycle stream: browserOnline
  // is fanned out to ALSO emit a synthetic gatewayConnected (there is no real
  // socket to report a reconnect), while every other browser event passes
  // through untouched. Neither arm had a test — the whole ternary was reached
  // only if something dispatched a window online/offline event, and nothing did.
  it("fans browserOnline out to a synthetic gatewayConnected", () => {
    const ports = buildBrowserPorts();
    const seen: ConnectionEvent[] = [];
    const sub = ports.connectionEvents.events().subscribe((e) => {
      seen.push(e);
    });

    // ConnectionEventsSimulator emits its own events on subscribe, so measure
    // only what the dispatch itself produced.
    const before = seen.length;
    window.dispatchEvent(new Event("online"));
    sub.unsubscribe();

    // Without the fan-out the app would come back online and sit in
    // DISCONNECTED forever, because nothing else reports the recovery.
    expect(
      seen.slice(before).map((e) => {
        return e.type;
      }),
    ).toEqual(["browserOnline", "gatewayConnected"]);
  });

  it("passes a non-online browser event through unchanged", () => {
    const ports = buildBrowserPorts();
    const seen: ConnectionEvent[] = [];
    const sub = ports.connectionEvents.events().subscribe((e) => {
      seen.push(e);
    });

    const before = seen.length;
    window.dispatchEvent(new Event("offline"));
    sub.unsubscribe();

    // The other arm: browserOffline must NOT acquire a phantom
    // gatewayConnected, which would flip the UI straight back to healthy.
    expect(
      seen.slice(before).map((e) => {
        return e.type;
      }),
    ).toEqual(["browserOffline"]);
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

// The NarratorMachine threshold seam. `import.meta.env.DEV` is `true` under
// vitest, so the first four cases vary only the query param; the last two
// stub DEV off to stand in for a production build, with and without the
// variable the e2e harness builds with.
describe("buildBrowserPorts — narratorConfig (the ?narratorThresholds=test seam)", () => {
  afterEach(() => {
    setSearch("");
    vi.unstubAllEnvs();
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

  it("a production build ignores the query param", () => {
    vi.stubEnv("DEV", false);
    setSearch("?narratorThresholds=test");
    const ports = buildBrowserPorts();
    expect(ports.narratorConfig).toBeUndefined();
  });

  it("a production build made with VITE_NARRATOR_TEST_SEAM=1 honours the query param, and only then", () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_NARRATOR_TEST_SEAM", "1");
    expect(buildBrowserPorts().narratorConfig).toBeUndefined();
    setSearch("?narratorThresholds=test");
    expect(buildBrowserPorts().narratorConfig?.minWindowFill).toBe(4);
  });
});

/** Drive window.location.search via the History API (jsdom-supported) —
 * same idiom as `@rtc/boot-splash`'s `bootSplashGate.test.ts`. */
function setSearch(search: string): void {
  window.history.replaceState({}, "", `/${search}`);
}
