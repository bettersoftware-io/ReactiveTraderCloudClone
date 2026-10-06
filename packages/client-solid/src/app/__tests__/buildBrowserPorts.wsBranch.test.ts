import { afterEach, describe, expect, it, vi } from "vitest";

import { WsAdapter } from "@rtc/client-adapters";
import {
  type ConnectionEvent,
  ConnectionStatus,
  nextConnectionStatus,
} from "@rtc/domain";
import { LocalStoragePreferencesAdapter } from "@rtc/web-boot";

import { buildBrowserPorts } from "#/app/buildBrowserPorts";

// The Solid mirror of client-react's buildBrowserPorts.wsBranch.test.ts — the
// two composition roots are functionally identical (only comments differ), so
// the contract they must satisfy is identical too.
//
// The sibling buildBrowserPorts.test.ts covers the simulator branch, which is
// what an unset VITE_SERVER_URL selects. Everything here is the OTHER half —
// the ws-real branch and the dev-auth parsing — which no test reached before.
// Both halves are composition-root wiring, the layer where a silent regression
// costs the most: a dropped serverUrl strands the app in simulator mode against
// a live server, and an eager connect sends a tokenless upgrade behind the
// login screen.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("buildBrowserPorts (ws-real branch)", () => {
  it("selects the ws-real branch and exposes the transport", () => {
    vi.stubEnv("VITE_SERVER_URL", WS_URL);

    const ports = buildBrowserPorts();

    // `transport` is the branch discriminator: the simulator branch has no
    // adapter to expose, so its absence is how "which branch ran" is observable.
    expect(ports.transport).toBeInstanceOf(WsAdapter);
  });

  it("does NOT open a socket at composition time", () => {
    vi.stubEnv("VITE_SERVER_URL", WS_URL);

    const ctor = vi.spyOn(globalThis, "WebSocket");

    buildBrowserPorts();

    // Regression pin for the pre-login WS gate: WsAdapter is built with
    // autoConnect: false so createApp's auth gate opens the socket AFTER login.
    // Connecting here would send a tokenless upgrade the server rejects, then
    // retry it on a timer while the user is still looking at the login screen.
    expect(ctor).not.toHaveBeenCalled();
  });

  it("still wires the browser-side ports that both branches share", () => {
    vi.stubEnv("VITE_SERVER_URL", WS_URL);

    const ports = buildBrowserPorts();

    expect(ports.preferences).toBeInstanceOf(LocalStoragePreferencesAdapter);
    expect(typeof ports.connectionEvents.events).toBe("function");
    expect(ports.colorScheme).toBeDefined();
    // bootSplash is optional on AppPorts, so assert presence before shape —
    // the ws branch must still seed the BootGatePresenter's one-shot decision.
    expect(ports.bootSplash).toBeDefined();
    expect(typeof ports.bootSplash?.shouldPlay).toBe("function");
  });

  it("merges gateway, browser and intent events into one stream", () => {
    vi.stubEnv("VITE_SERVER_URL", WS_URL);

    const ports = buildBrowserPorts();
    // Subscribing proves the merge/tap pipeline actually assembles — the tap
    // routes idle lifecycle events back into the transport, so a broken
    // composition throws here rather than at first disconnect in production.
    const sub = ports.connectionEvents.events().subscribe();

    expect(sub.closed).toBe(false);
    sub.unsubscribe();
  });

  it("routes idle-lifecycle events from the merged stream to the transport", () => {
    vi.stubEnv("VITE_SERVER_URL", WS_URL);

    const ports = buildBrowserPorts();
    const closeForIdle = vi.spyOn(ports.transport as WsAdapter, "closeForIdle");
    const reopen = vi.spyOn(ports.transport as WsAdapter, "reopen");

    const sub = ports.connectionEvents.events().subscribe();

    // The `tap` that side-effects the transport only runs while something is
    // subscribed, so this is the whole point of the subscription above: it is
    // how idleTimeout actually reaches closeForIdle() in the running app.
    // Routed through the port, not a module-level Subject: `connectionIntents`
    // is paired with THIS `ports` instance's own `connectionEvents`.
    ports.connectionIntents.injectIncident({ type: "idleTimeout" });
    ports.connectionIntents.reconnect();

    expect(closeForIdle).toHaveBeenCalledTimes(1);
    expect(reopen).toHaveBeenCalledTimes(1);

    sub.unsubscribe();
  });

  it("returns to CONNECTED when the browser comes back online over a socket that never dropped", () => {
    vi.stubEnv("VITE_SERVER_URL", WS_URL);

    const sockets = createOpenableWebSocket();
    const ports = buildBrowserPorts();
    const seen: ConnectionEvent[] = [];
    const sub = ports.connectionEvents.events().subscribe((event) => {
      seen.push(event);
    });

    ports.transport?.connect();
    sockets[0]?.onopen?.();
    // A server on this machine: the socket outlives the network going away.
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));

    expect(seen.reduce(nextConnectionStatus, ConnectionStatus.CONNECTING)).toBe(
      ConnectionStatus.CONNECTED,
    );
    sub.unsubscribe();
  });

  it.each([
    ["idle first, then offline", ["idle", "offline"]],
    ["offline first, then idle", ["offline", "idle"]],
  ] as const)(
    "reopens a socket closed for idle when the browser comes back online (%s)",
    async (_label, order) => {
      vi.stubEnv("VITE_SERVER_URL", WS_URL);

      const sockets = createOpenableWebSocket();
      const ports = buildBrowserPorts();
      const seen: ConnectionEvent[] = [];
      const sub = ports.connectionEvents.events().subscribe((event) => {
        seen.push(event);
      });

      ports.transport?.connect();
      sockets[0]?.onopen?.();

      for (const step of order) {
        if (step === "idle") {
          // The idle timer's event, without the 15-minute wait. The
          // socket's own `close` event never arrives here, as with no
          // network: the adapter reports the close itself, a microtask on.
          ports.connectionIntents.injectIncident({ type: "idleTimeout" });
          await Promise.resolve();
        } else {
          window.dispatchEvent(new Event("offline"));
        }
      }

      window.dispatchEvent(new Event("online"));

      // Nothing else would reopen it: the status would sit on CONNECTING.
      expect(sockets).toHaveLength(2);
      // The new socket is still connecting, and the status says so: the
      // old socket's connection is not repeated as if it were this one's.
      expect(
        seen.reduce(nextConnectionStatus, ConnectionStatus.CONNECTING),
      ).toBe(ConnectionStatus.CONNECTING);
      sockets[1]?.onopen?.();
      expect(
        seen.reduce(nextConnectionStatus, ConnectionStatus.CONNECTING),
      ).toBe(ConnectionStatus.CONNECTED);
      sub.unsubscribe();
    },
  );

  it("treats an empty VITE_SERVER_URL as simulator mode", () => {
    // The `:sim` dev scripts set the var to the empty string rather than
    // unsetting it, so empty MUST fall through to the simulator branch.
    vi.stubEnv("VITE_SERVER_URL", "");

    expect(buildBrowserPorts().transport).toBeUndefined();
  });

  const WS_URL = "ws://localhost:4000";
});

describe("buildBrowserPorts dev-auth parsing (simulator branch)", () => {
  it("accepts a roster login when VITE_DEV_AUTH holds the credential", () => {
    expect(loginOutcome(JSON.stringify({ [DEMO_USER]: DEMO_PASS })).ok).toBe(
      true,
    );
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["a JSON scalar rather than an object", '"just-a-string"'],
    ["JSON null", "null"],
    ["an empty value", ""],
  ])("degrades to no dev logins on %s", (_label, raw) => {
    // Deliberately a soft degrade, not a throw: a bad env var must cost the
    // developer their logins, not crash the app at boot.
    expect(loginOutcome(raw).ok).toBe(false);
  });

  it("ignores entries whose value is not a string", () => {
    expect(loginOutcome(JSON.stringify({ [DEMO_USER]: 1234 })).ok).toBe(false);
  });

  it("keeps string entries alongside dropped non-string ones", () => {
    const raw = JSON.stringify({
      [DEMO_USER]: DEMO_PASS,
      astark: { nested: true },
    });

    expect(loginOutcome(raw).ok).toBe(true);
  });
});

interface LoginProbe {
  readonly ok: boolean;
}

/** Seeds VITE_DEV_AUTH, rebuilds the ports, and reports the login result. */
function loginOutcome(devAuth: string): LoginProbe {
  vi.stubEnv("VITE_DEV_AUTH", devAuth);

  let outcome: LoginProbe = { ok: false };

  buildBrowserPorts()
    .auth.login(DEMO_USER, DEMO_PASS)
    .subscribe((result) => {
      outcome = result;
    });

  return outcome;
}

interface OpenableSocket {
  onopen: (() => void) | null;
}

/** Replaces WebSocket with a stub a test opens by hand, and returns the
 * instances built, so the adapter's `onopen` can be driven. */
function createOpenableWebSocket(): OpenableSocket[] {
  const sockets: OpenableSocket[] = [];

  // A constructor that returns an object hands `new` that object.
  function createSocket(): OpenableSocket {
    const socket = {
      onopen: null,
      close: (): void => {},
      send: (): void => {},
    };
    sockets.push(socket);
    return socket;
  }

  vi.stubGlobal("WebSocket", createSocket);

  return sockets;
}

// `demo` is a committed demo-roster account (packages/domain/src/auth/roster.ts).
const DEMO_USER = "demo";

const DEMO_PASS = "mcdc2026";
