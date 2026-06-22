import { Then } from "@cucumber/cucumber";

import * as analytics from "../scenarios/analytics";
import type { StepContext } from "../testContext";

Then(
  "the analytics panel is visible within {int} seconds",
  function analyticsPanelVisibleWithin(this: StepContext, seconds: number) {
    return analytics.expectAnalyticsPanelVisibleWithin(this.ctx, seconds);
  },
);

Then(
  "the analytics panel shows the section {string}",
  function analyticsShowsSection(this: StepContext, name: string) {
    return analytics.expectAnalyticsHasSection(this.ctx, name);
  },
);

Then(
  "the analytics presenter emits within {int} seconds",
  function analyticsPresenterEmitsWithin(this: StepContext, n: number) {
    return analytics.expectAnalyticsPanelVisibleWithin(this.ctx, n);
  },
);
