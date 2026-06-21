import { Then, When } from "@cucumber/cucumber";
import * as connection from "../scenarios/connection";
import type { StepContext } from "../testContext";

When("the browser goes offline", function (this: StepContext) {
  return connection.setBrowserOffline(this.ctx, true);
});

When("the browser comes back online", function (this: StepContext) {
  return connection.setBrowserOffline(this.ctx, false);
});

Then("the connection status footer is visible", function (this: StepContext) {
  return connection.expectConnectionStatusFooterVisible(this.ctx);
});

Then(
  "the connection status footer shows {string}",
  function (this: StepContext, expected: string) {
    return connection.expectConnectionStatusFooterShows(this.ctx, expected);
  },
);

Then("the connection overlay is hidden", function (this: StepContext) {
  return connection.expectConnectionOverlayHidden(this.ctx);
});

Then(
  "the connection overlay becomes visible within {int} seconds",
  function (this: StepContext, seconds: number) {
    return connection.expectConnectionOverlayVisibleWithin(this.ctx, seconds);
  },
);

Then(
  "the connection overlay is hidden within {int} seconds",
  function (this: StepContext, seconds: number) {
    return connection.expectConnectionOverlayHiddenWithin(this.ctx, seconds);
  },
);

Then(
  "the connection overlay text matches {}",
  function (this: StepContext, raw: string) {
    return connection.expectConnectionOverlayTextMatches(this.ctx, raw);
  },
);
