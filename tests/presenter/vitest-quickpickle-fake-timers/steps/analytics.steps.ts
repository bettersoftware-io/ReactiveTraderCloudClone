// tests/presenter/vitest-quickpickle-fake-timers/steps/analytics.steps.ts
import { Then } from "quickpickle";

import * as analytics from "#/presenter/scenarios/_shared/analytics";

import type { VitestFakePresenterWorld } from "../world";

Then(
  "the analytics panel is visible within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) => {
    return analytics.expectAnalyticsVisibleWithin(state, n);
  },
);

Then(
  "the analytics presenter emits within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) => {
    return analytics.expectAnalyticsEmits(state, n);
  },
);
