import { filter, firstValueFrom } from "rxjs";
import { expect, test, vi } from "vitest";

import { createApp } from "@rtc/client-core";
import { ConnectionStatus } from "@rtc/domain";

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

// expo-constants has no runtime `expoConfig` under vitest-node; stub it so the
// module import resolves and `Constants.expoConfig?.extra ?? {}` never throws.
// The simulator branch forces `url = undefined` and never reads `serverUrl`.
vi.mock("expo-constants", () => {
  return { default: { expoConfig: { extra: {} } } };
});
