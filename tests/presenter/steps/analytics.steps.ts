// tests/presenter/steps/analytics.steps.ts
import { Then } from "@cucumber/cucumber";

import type { PresenterWorld } from "../cucumber-fake-timers/world.ts";
import * as analytics from "../scenarios/_shared/analytics.ts";

Then(
  "the analytics panel is visible within {int} seconds",
  function analyticsPanelVisibleWithin(this: PresenterWorld, n: number) {
    return analytics.expectAnalyticsVisibleWithin(this, n);
  },
);

Then(
  "the analytics presenter emits within {int} seconds",
  function analyticsPresenterEmitsWithin(this: PresenterWorld, n: number) {
    return analytics.expectAnalyticsEmits(this, n);
  },
);
