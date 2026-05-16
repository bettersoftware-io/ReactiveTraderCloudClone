// tests/steps/presenter/cucumber-real/connection.steps.ts
//
// NOTE: ConnectionStatus is a `const enum` in @rtc/domain source. With
// verbatimModuleSyntax + isolatedModules, ambient const enums cannot be
// accessed as values from a different package. We use their string literals
// directly (safe because all members are string-valued) and cast via
// `import type { ConnectionStatus }` for the type annotation only.
import { Then, When } from "@cucumber/cucumber";
import type { ConnectionStatus } from "@rtc/domain";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
import * as conn from "../../../scenarios/presenter/cucumber-real/connection";

// String-literal stand-ins for ConnectionStatus const enum values.
const CS_CONNECTED = "CONNECTED" as unknown as ConnectionStatus;
const CS_OFFLINE = "OFFLINE_DISCONNECTED" as unknown as ConnectionStatus;

When("the browser goes offline",
  function(this: PresenterWorld) { return conn.browserGoesOffline(this); });

When("the browser comes back online",
  function(this: PresenterWorld) { return conn.browserComesBackOnline(this); });

Then("the connection status footer is visible",
  function(this: PresenterWorld) { return conn.noopAssertConnectionUiPresent(this); });

Then("the connection status footer shows {string}",
  function(this: PresenterWorld, label: string) {
    const target = label === "Connected" ? CS_CONNECTED : CS_OFFLINE;
    return conn.expectStatusEqualsWithin(this, target, 3);
  });

Then("the connection overlay is hidden",
  function(this: PresenterWorld) {
    return conn.expectStatusEqualsWithin(this, CS_CONNECTED, 1);
  });

Then("the connection overlay is hidden within {int} seconds",
  function(this: PresenterWorld, n: number) {
    return conn.expectStatusEqualsWithin(this, CS_CONNECTED, n);
  });

Then("the connection overlay becomes visible within {int} seconds",
  function(this: PresenterWorld, n: number) {
    // "overlay visible" = status has left CONNECTED (reached a disconnected state)
    return conn.expectStatusEqualsWithin(this, CS_OFFLINE, n);
  });

Then("the connection overlay text matches \\/offline\\/i",
  function(this: PresenterWorld) { return conn.noopAssertConnectionUiPresent(this); });
