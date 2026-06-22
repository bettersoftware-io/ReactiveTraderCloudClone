// tests/presenter/steps/connection.steps.ts
//
// NOTE: ConnectionStatus is a `const enum` in @rtc/domain source. With
// verbatimModuleSyntax + isolatedModules, ambient const enums cannot be
// accessed as values from a different package. We use their string literals
// directly (safe because all members are string-valued) and cast via
// `import type { ConnectionStatus }` for the type annotation only.
import { Then, When } from "@cucumber/cucumber";

import type { ConnectionStatus } from "@rtc/domain";

import type { PresenterWorld } from "../cucumber/world";
import * as conn from "../scenarios/_shared/connection";

// String-literal stand-ins for ConnectionStatus const enum values.
const CS_CONNECTED = "CONNECTED" as unknown as ConnectionStatus;
const CS_OFFLINE = "OFFLINE_DISCONNECTED" as unknown as ConnectionStatus;
const CS_DISCONNECTED = "DISCONNECTED" as unknown as ConnectionStatus;
const CS_CONNECTING = "CONNECTING" as unknown as ConnectionStatus;
const CS_IDLE = "IDLE_DISCONNECTED" as unknown as ConnectionStatus;

const FOOTER_LABEL_TO_STATUS: Record<string, ConnectionStatus> = {
  Connected: CS_CONNECTED,
  Offline: CS_OFFLINE,
  Disconnected: CS_DISCONNECTED,
  "Connecting...": CS_CONNECTING,
  Idle: CS_IDLE,
};

When(
  "the browser goes offline",
  function browserGoesOffline(this: PresenterWorld) {
    return conn.browserGoesOffline(this);
  },
);

When(
  "the browser comes back online",
  function browserComesBackOnline(this: PresenterWorld) {
    return conn.browserComesBackOnline(this);
  },
);

When(
  "the gateway connection drops",
  function gatewayConnectionDrops(this: PresenterWorld) {
    return conn.gatewayDrops(this);
  },
);

When(
  "the gateway attempts to reconnect",
  function gatewayAttemptsToReconnect(this: PresenterWorld) {
    return conn.gatewayAttemptsReconnect(this);
  },
);

When(
  "the gateway connection is restored",
  function gatewayConnectionRestored(this: PresenterWorld) {
    return conn.gatewayConnectionRestored(this);
  },
);

Then(
  "the connection status footer is visible",
  function connectionStatusFooterVisible(this: PresenterWorld) {
    return conn.noopAssertConnectionUiPresent(this);
  },
);

Then(
  "the connection status footer shows {string}",
  function connectionStatusFooterShows(this: PresenterWorld, label: string) {
    const target = FOOTER_LABEL_TO_STATUS[label] ?? CS_OFFLINE;
    return conn.expectStatusEqualsWithin(this, target, 3);
  },
);

Then(
  "the connection overlay is hidden",
  function connectionOverlayHidden(this: PresenterWorld) {
    return conn.expectStatusEqualsWithin(this, CS_CONNECTED, 1);
  },
);

Then(
  "the connection overlay is hidden within {int} seconds",
  function connectionOverlayHiddenWithin(this: PresenterWorld, n: number) {
    return conn.expectStatusEqualsWithin(this, CS_CONNECTED, n);
  },
);

Then(
  "the connection overlay becomes visible within {int} seconds",
  function connectionOverlayBecomesVisibleWithin(
    this: PresenterWorld,
    n: number,
  ) {
    // "overlay visible" = status has left CONNECTED (reached a disconnected state)
    return conn.expectStatusEqualsWithin(this, CS_OFFLINE, n);
  },
);

Then(
  "the connection overlay text matches \\/offline\\/i",
  function connectionOverlayTextMatchesOffline(this: PresenterWorld) {
    return conn.noopAssertConnectionUiPresent(this);
  },
);
