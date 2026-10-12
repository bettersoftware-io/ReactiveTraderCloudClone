import { filter, firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";

import { InMemorySessionStore, type WsAdapter } from "@rtc/client-adapters";
import { createApp } from "@rtc/client-core-rxjs";
import {
  type AuthOutcome,
  type ConnectionEvent,
  ConnectionStatus,
  findRosterUser,
} from "@rtc/domain";

import { buildNativePorts } from "#/app/buildNativePorts";

// Mutable holder so individual tests can flip `expoConfig.extra` — the
// simulator tests want it empty; the real-WS tests below set `serverUrl` to
// select the WsAdapter branch. `vi.hoisted` runs before the `vi.mock` factory,
// so the getter in the mock reads whatever a test last assigned.
const constantsHolder = vi.hoisted(() => {
  return { extra: {} as Record<string, unknown> };
});

test("simulator branch composes an App and streams currency pairs", async () => {
  const app = createApp(buildNativePorts({ simulator: true }).ports);
  const pairs = await firstValueFrom(app.presenters.currencyPairs.pairs$);
  expect(
    pairs.map((p) => {
      return p.symbol;
    }),
  ).toContain("EURUSD");
});

test("simulator branch reaches CONNECTED (ConnectionEventsSimulator wired)", async () => {
  const app = createApp(buildNativePorts({ simulator: true }).ports);
  // The ConnectionEventsSimulator emits gatewayConnected on subscribe; without
  // it the presenter stays at CONNECTING forever and this never resolves.
  const connected = await firstValueFrom(
    app.presenters.connection.status$.pipe(
      filter((s) => {
        return s === ConnectionStatus.CONNECTED;
      }),
    ),
  );
  expect(connected).toBe(ConnectionStatus.CONNECTED);
});

test("simulator branch's connectionIntents.reconnect() resumes via a synthesized gatewayConnected", () => {
  // Pins the pairConnectionPorts wiring for the simulator branch specifically:
  // it has no real socket to report recovery, so `connectionIntents` must
  // reach the SAME `reconnects` the merge in `buildNativePorts` synthesizes
  // `gatewayConnected` from, or the Reconnect command is a no-op offline.
  //
  // Counted rather than `toContainEqual`: ConnectionEventsSimulator ALSO
  // emits a one-shot gatewayConnected synchronously on subscribe (see
  // "…reaches CONNECTED" above), so a mere presence check would pass even
  // against a `connectionIntents` wired to nothing.
  const { ports } = buildNativePorts({ simulator: true });
  const seen: ConnectionEvent[] = [];

  function gatewayConnectedCount(): number {
    return seen.filter((e) => {
      return e.type === "gatewayConnected";
    }).length;
  }

  const sub = ports.connectionEvents.events().subscribe((e) => {
    seen.push(e);
  });

  expect(gatewayConnectedCount()).toBe(1);

  ports.connectionIntents.reconnect();

  expect(gatewayConnectedCount()).toBe(2);

  sub.unsubscribe();
});

test("simulator branch's connectionIntents.injectIncident() reaches connectionEvents", () => {
  // The "connected-only" reconnect rendering (see the test above) is a
  // per-branch OPTION to pairConnectionPorts; incident injection is never
  // optioned — it always merges in unmodified — but nothing else in this
  // file exercised it for the simulator branch specifically before now.
  const { ports } = buildNativePorts({ simulator: true });
  const seen: ConnectionEvent[] = [];
  const sub = ports.connectionEvents.events().subscribe((e) => {
    seen.push(e);
  });

  ports.connectionIntents.injectIncident({ type: "idleTimeout" });

  expect(seen).toContainEqual({ type: "idleTimeout" });

  sub.unsubscribe();
});

test("simulator branch dispose is a no-op function (no socket to close)", () => {
  const { dispose } = buildNativePorts({ simulator: true });
  expect(dispose).toBeTypeOf("function");
  expect(() => {
    dispose();
  }).not.toThrow();
});

// With no `extra.devAuth` configured (the stubbed `expo-constants` below sets
// `extra: {}`), `nativeAuthConfig`'s `DEV_CREDENTIALS` falls back to all four
// roster usernames at the shared dev password — so offline simulator mode can
// log in as any of them, not just a single baked demo user.
describe("simulator branch auth accepts every fallback roster credential", () => {
  const fallbackCredentials: ReadonlyArray<[string, string]> = [
    ["astark", "mcdc2026"],
    ["nromanoff", "mcdc2026"],
    ["tchalla", "mcdc2026"],
    ["demo", "mcdc2026"],
  ];

  it.each(fallbackCredentials)(
    "login(%s, %s) succeeds",
    async (username, password) => {
      const { ports } = buildNativePorts({ simulator: true });
      const outcome: AuthOutcome = await firstValueFrom(
        ports.auth.login(username, password),
      );
      expect(outcome.ok).toBe(true);
    },
  );

  it("rejects a wrong password for a valid roster username", async () => {
    const { ports } = buildNativePorts({ simulator: true });
    const outcome: AuthOutcome = await firstValueFrom(
      ports.auth.login("astark", "wrong-password"),
    );
    expect(outcome.ok).toBe(false);
  });
});

// The real-WS branch must NOT open a socket until the user is authenticated —
// otherwise the tokenless upgrade the server rejects retries forever behind the
// login screen (the "WebSocket connects before login" defect, fixed in the web
// clients and shared client-core-rxjs; these tests pin the RN wiring specifically,
// since client-core-rxjs's own gate tests inject a fake transport and never exercise
// `buildNativePorts`). A counting `WebSocket` stub is the oracle: the RN app's
// socket construction is fully observable here in Node, no device or inspector
// needed.
describe("real-WS branch gates the socket on authentication", () => {
  // Mirrors client-adapters's MockWebSocket.testHelpers: the static OPEN (=1) and
  // readyState (=0, never OPEN here) make WsAdapter.send() buffer into its
  // sendQueue rather than call a live socket, so eager port subscriptions at
  // createApp time (e.g. the watchlist SUBSCRIBE) don't throw against the stub.
  class MockWebSocket {
    static OPEN = 1;

    static instances = 0;

    static lastUrl = "";

    readyState = 0;

    onopen: ((ev: unknown) => void) | null = null;

    onmessage: ((ev: unknown) => void) | null = null;

    onclose: ((ev: unknown) => void) | null = null;

    onerror: ((ev: unknown) => void) | null = null;

    send = (): void => {};

    close = (): void => {};

    constructor(url: string) {
      MockWebSocket.instances++;
      MockWebSocket.lastUrl = url;
    }
  }

  beforeEach(() => {
    constantsHolder.extra = { serverUrl: "ws://test.local:4000" };
    MockWebSocket.instances = 0;
    MockWebSocket.lastUrl = "";
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    constantsHolder.extra = {};
  });

  it("opens no socket while unauthenticated (autoConnect: false is wired)", () => {
    // No session → the auth gate keeps the transport closed. Pre-fix, the
    // WsAdapter constructor connected eagerly and this would be 1.
    const composition = buildNativePorts({
      sessionStore: new InMemorySessionStore(),
    });
    createApp(composition.ports);

    expect(MockWebSocket.instances).toBe(0);

    composition.dispose();
  });

  it("opens exactly one token-bearing socket for a resumed session", () => {
    // A persisted, unexpired session makes AuthPresenter resume as
    // authenticated at composition time, so the gate connects synchronously.
    // This only passes if `buildNativePorts` actually passed the adapter as
    // `transport` — otherwise the gate has nothing to open and instances stay 0.
    const entry = findRosterUser("demo");

    if (!entry) {
      throw new Error("roster is missing the demo account");
    }

    const store = new InMemorySessionStore();
    store.write({
      username: "demo",
      token: "seeded-token",
      user: entry.user,
      exp: Date.now() + 60_000,
    });

    const composition = buildNativePorts({ sessionStore: store });
    createApp(composition.ports);

    expect(MockWebSocket.instances).toBe(1);
    expect(MockWebSocket.lastUrl).toContain("access=seeded-token");

    composition.dispose();
  });

  it("routes idle-lifecycle events from ports.connectionIntents to the transport", () => {
    // Pins the pairConnectionPorts wiring: `connectionIntents` and
    // `connectionEvents` must come from the SAME pair, or a Reconnect command
    // (and the admin incident injection) push into a stream nothing observes,
    // and the transport is never told to reopen/close for idle.
    const entry = findRosterUser("demo");

    if (!entry) {
      throw new Error("roster is missing the demo account");
    }

    const store = new InMemorySessionStore();
    store.write({
      username: "demo",
      token: "seeded-token",
      user: entry.user,
      exp: Date.now() + 60_000,
    });

    const composition = buildNativePorts({ sessionStore: store });
    createApp(composition.ports);
    const closeForIdle = vi.spyOn(
      composition.ports.transport as WsAdapter,
      "closeForIdle",
    );
    const reopen = vi.spyOn(composition.ports.transport as WsAdapter, "reopen");

    const sub = composition.ports.connectionEvents.events().subscribe();

    composition.ports.connectionIntents.injectIncident({
      type: "idleTimeout",
    });
    composition.ports.connectionIntents.reconnect();

    expect(closeForIdle).toHaveBeenCalledTimes(1);
    expect(reopen).toHaveBeenCalledTimes(1);

    sub.unsubscribe();
    composition.dispose();
  });
});

// expo-constants has no runtime `expoConfig` under vitest-node; stub it so the
// module import resolves and `Constants.expoConfig?.extra ?? {}` never throws.
// The simulator branch forces `url = undefined` and never reads `serverUrl`;
// the real-WS tests assign `constantsHolder.extra.serverUrl` to select the
// WsAdapter branch.
vi.mock("expo-constants", () => {
  return {
    default: {
      expoConfig: {
        get extra(): Record<string, unknown> {
          return constantsHolder.extra;
        },
      },
    },
  };
});

// buildNativePorts wires an AppearanceColorSchemeAdapter, whose module scope
// reads `react-native`'s `Appearance` at import time. Vitest's node
// environment runs the SSR transform (rolldown) directly against
// node_modules, which cannot parse the Flow syntax in react-native's own
// entry point — so the real module never loads under vitest at all (jest's
// babel-based transform handles it fine; see AppearanceColorSchemeAdapter's
// own .test.tsx under jest). Stub the sliver this composition path touches.
vi.mock("react-native", () => {
  return {
    Appearance: {
      getColorScheme: () => {
        return null;
      },
      addChangeListener: () => {
        return { remove: () => {} };
      },
    },
  };
});
