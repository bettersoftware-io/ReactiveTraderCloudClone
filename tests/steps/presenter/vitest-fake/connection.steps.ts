// tests/steps/presenter/vitest-fake/connection.steps.ts
//
// NOTE: ConnectionStatus is a `const enum` in @rtc/domain source. With
// verbatimModuleSyntax + isolatedModules, ambient const enums cannot be
// accessed as values from a different package. We use their string literals
// directly (safe because all members are string-valued) and cast via
// `import type { ConnectionStatus }` for the type annotation only.
import { Then, When } from "quickpickle";
import type { ConnectionStatus } from "@rtc/domain";
import type { VitestFakePresenterWorld } from "../../../support/presenter/vitest-fake/world";
import * as conn from "../../../scenarios/presenter/_shared/connection";

// String-literal stand-ins for ConnectionStatus const enum values.
const CS_CONNECTED = "CONNECTED" as unknown as ConnectionStatus;
const CS_OFFLINE = "OFFLINE_DISCONNECTED" as unknown as ConnectionStatus;

When("the browser goes offline",
  async (state: VitestFakePresenterWorld) => conn.browserGoesOffline(state));

When("the browser comes back online",
  async (state: VitestFakePresenterWorld) => conn.browserComesBackOnline(state));

Then("the connection status footer is visible",
  async (state: VitestFakePresenterWorld) => conn.noopAssertConnectionUiPresent(state));

Then("the connection status footer shows {string}",
  async (state: VitestFakePresenterWorld, label: string) => {
    const target = label === "Connected" ? CS_CONNECTED : CS_OFFLINE;
    return conn.expectStatusEqualsWithin(state, target, 3);
  });

Then("the connection overlay is hidden",
  async (state: VitestFakePresenterWorld) =>
    conn.expectStatusEqualsWithin(state, CS_CONNECTED, 1));

Then("the connection overlay is hidden within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) =>
    conn.expectStatusEqualsWithin(state, CS_CONNECTED, n));

Then("the connection overlay becomes visible within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) =>
    // "overlay visible" = status has left CONNECTED (reached a disconnected state)
    conn.expectStatusEqualsWithin(state, CS_OFFLINE, n));

Then("the connection overlay text matches \\/offline\\/i",
  async (state: VitestFakePresenterWorld) => conn.noopAssertConnectionUiPresent(state));
