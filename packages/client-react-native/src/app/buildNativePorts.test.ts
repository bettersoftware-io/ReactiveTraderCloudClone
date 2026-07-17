import { filter, firstValueFrom } from "rxjs";
import { describe, expect, it, test, vi } from "vitest";

import { createApp } from "@rtc/client-core";
import { type AuthOutcome, ConnectionStatus } from "@rtc/domain";

import { buildNativePorts } from "#/app/buildNativePorts";

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
    ["astark", "demo"],
    ["nromanoff", "demo"],
    ["tchalla", "demo"],
    ["demo", "demo"],
  ];

  it.each(
    fallbackCredentials,
  )("login(%s, %s) succeeds", async (username, password) => {
    const { ports } = buildNativePorts({ simulator: true });
    const outcome: AuthOutcome = await firstValueFrom(
      ports.auth.login(username, password),
    );
    expect(outcome.ok).toBe(true);
  });

  it("rejects a wrong password for a valid roster username", async () => {
    const { ports } = buildNativePorts({ simulator: true });
    const outcome: AuthOutcome = await firstValueFrom(
      ports.auth.login("astark", "wrong-password"),
    );
    expect(outcome.ok).toBe(false);
  });
});

// expo-constants has no runtime `expoConfig` under vitest-node; stub it so the
// module import resolves and `Constants.expoConfig?.extra ?? {}` never throws.
// The simulator branch forces `url = undefined` and never reads `serverUrl`.
vi.mock("expo-constants", () => {
  return { default: { expoConfig: { extra: {} } } };
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
