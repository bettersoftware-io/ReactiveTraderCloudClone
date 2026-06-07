import { Then } from "@cucumber/cucumber";
import type { StepContext } from "../testContext";
import * as analytics from "../scenarios/analytics";

Then("the analytics panel is visible within {int} seconds",
  function(this: StepContext, seconds: number) {
    return analytics.expectAnalyticsPanelVisibleWithin(this.ctx, seconds);
  });

Then("the analytics panel shows the section {string}",
  function(this: StepContext, name: string) {
    return analytics.expectAnalyticsHasSection(this.ctx, name);
  });

Then("the analytics presenter emits within {int} seconds",
  function(this: StepContext, n: number) {
    return analytics.expectAnalyticsPanelVisibleWithin(this.ctx, n);
  });
