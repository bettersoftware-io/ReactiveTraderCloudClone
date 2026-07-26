import { afterEach, describe, expect, it, vi } from "vitest";

import { incident$, reconnect$, WsAdapter } from "@rtc/client-core";

import { LocalStoragePreferencesAdapter } from "#/app/adapters/LocalStoragePreferencesAdapter";
import { LocalStorageSessionStore } from "#/app/adapters/LocalStorageSessionStore";
import { buildBrowserPorts } from "#/app/buildBrowserPorts";

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
  const WS_URL = "ws://localhost:4000";

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

  it("supplies the stored session token when the gate later connects", () => {
    vi.stubEnv("VITE_SERVER_URL", WS_URL);
    seedSession("tok-abc123");

    const sockets = stubWebSocket();
    const ports = buildBrowserPorts();

    // The composition root hands WsAdapter a token PROVIDER, not a token —
    // read fresh per (re)connect. Nothing invokes it until the auth gate
    // opens the socket, which is why the pin above (no eager connect) leaves
    // it unexercised. Drive the same call the gate makes.
    ports.transport?.connect();

    expect(sockets).toHaveLength(1);
    expect(sockets[0]).toContain("tok-abc123");
  });

  it("re-reads the token on every connect rather than baking it in", () => {
    vi.stubEnv("VITE_SERVER_URL", WS_URL);
    seedSession("first-token");

    const sockets = stubWebSocket();
    const ports = buildBrowserPorts();

    ports.transport?.connect();
    ports.transport?.disconnect();
    seedSession("second-token"); // e.g. a re-login between drops
    ports.transport?.connect();

    // A provider that captured the token at composition time would send the
    // stale one here, and the upgrade would be rejected after a re-login.
    expect(sockets[1]).toContain("second-token");
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
    incident$.next({ type: "idleTimeout" });
    reconnect$.next({ type: "reconnect" });

    expect(closeForIdle).toHaveBeenCalledTimes(1);
    expect(reopen).toHaveBeenCalledTimes(1);

    sub.unsubscribe();
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

  it("treats an empty VITE_SERVER_URL as simulator mode", () => {
    // The `:sim` dev scripts set the var to the empty string rather than
    // unsetting it, so empty MUST fall through to the simulator branch.
    vi.stubEnv("VITE_SERVER_URL", "");

    expect(buildBrowserPorts().transport).toBeUndefined();
  });
});

// `demo` is a committed demo-roster account (packages/domain/src/auth/roster.ts).
const DEMO_USER = "demo";
const DEMO_PASS = "mcdc2026";

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

/** Writes a session whose token is `token`, so the adapter's token provider
 * has something to read. */
function seedSession(token: string): void {
  new LocalStorageSessionStore().write({
    token,
    username: "demo",
    exp: Date.now() + 60_000,
    user: {
      name: "Demo User",
      initials: "DU",
      role: "trader",
      id: "u1",
      email: "demo@example.com",
      desk: "FX",
      clearance: "standard",
    },
  });
}

/** Replaces WebSocket with an inert stub and returns the list of URLs it was
 * constructed with, so a test can read the token off the connect URL. */
function stubWebSocket(): string[] {
  const urls: string[] = [];

  vi.stubGlobal(
    "WebSocket",
    class {
      constructor(url: string) {
        urls.push(url);
      }

      close(): void {}

      send(): void {}
    },
  );

  return urls;
}
