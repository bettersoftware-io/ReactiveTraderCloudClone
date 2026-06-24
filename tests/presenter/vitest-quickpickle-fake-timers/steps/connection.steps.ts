// tests/presenter/vitest-quickpickle-fake-timers/steps/connection.steps.ts
//
// NOTE: ConnectionStatus is a `const enum` in @rtc/domain source. With
// verbatimModuleSyntax + isolatedModules, ambient const enums cannot be
// accessed as values from a different package. We use their string literals
// directly (safe because all members are string-valued) and cast via
// `import type { ConnectionStatus }` for the type annotation only.

import { Then, When } from "quickpickle";

import type { ConnectionStatus } from "@rtc/domain";

import * as conn from "#/presenter/scenarios/_shared/connection";

import type { VitestFakePresenterWorld } from "../world";

// String-literal stand-ins for ConnectionStatus const enum values.
const CS_CONNECTED = "CONNECTED" as unknown as ConnectionStatus;
const CS_OFFLINE = "OFFLINE_DISCONNECTED" as unknown as ConnectionStatus;
const CS_DISCONNECTED = "DISCONNECTED" as unknown as ConnectionStatus;
const CS_CONNECTING = "CONNECTING" as unknown as ConnectionStatus;
const CS_IDLE = "IDLE_DISCONNECTED" as unknown as ConnectionStatus;

const FOOTER_LABEL_TO_STATUSES: Record<string, ConnectionStatus[]> = {
  Connected: [CS_CONNECTED],
  Disconnected: [CS_DISCONNECTED, CS_IDLE, CS_OFFLINE],
  "Connecting...": [CS_CONNECTING],
};

When("the browser goes offline", async (state: VitestFakePresenterWorld) => {
  return conn.browserGoesOffline(state);
});

When(
  "the browser comes back online",
  async (state: VitestFakePresenterWorld) => {
    return conn.browserComesBackOnline(state);
  },
);

When(
  "the gateway connection drops",
  async (state: VitestFakePresenterWorld) => {
    return conn.gatewayDrops(state);
  },
);

When(
  "the gateway attempts to reconnect",
  async (state: VitestFakePresenterWorld) => {
    return conn.gatewayAttemptsReconnect(state);
  },
);

When(
  "the gateway connection is restored",
  async (state: VitestFakePresenterWorld) => {
    return conn.gatewayConnectionRestored(state);
  },
);

Then(
  "the connection status footer is visible",
  async (state: VitestFakePresenterWorld) => {
    return conn.noopAssertConnectionUiPresent(state);
  },
);

Then(
  "the connection status footer shows {string}",
  async (state: VitestFakePresenterWorld, label: string) => {
    const targets = FOOTER_LABEL_TO_STATUSES[label] ?? [CS_DISCONNECTED];
    return conn.expectStatusInWithin(state, targets, 3);
  },
);

Then(
  "the connection overlay is hidden",
  async (state: VitestFakePresenterWorld) => {
    return conn.expectStatusEqualsWithin(state, CS_CONNECTED, 1);
  },
);

Then(
  "the connection overlay is hidden within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) => {
    return conn.expectStatusEqualsWithin(state, CS_CONNECTED, n);
  },
);

Then(
  "the connection overlay becomes visible within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) =>
    // "overlay visible" = status has left CONNECTED (reached a disconnected state)
    {
      return conn.expectStatusEqualsWithin(state, CS_OFFLINE, n);
    },
);

Then(
  "the connection overlay text matches \\/offline\\/i",
  async (state: VitestFakePresenterWorld) => {
    return conn.noopAssertConnectionUiPresent(state);
  },
);
