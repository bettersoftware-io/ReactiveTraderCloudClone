// tests/presenter/vitest-fake-timers/steps/analytics.steps.ts
import { Then } from "quickpickle";
import type { VitestFakePresenterWorld } from "../world";
import * as analytics from "../../scenarios/_shared/analytics";

Then("the analytics panel is visible within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) => analytics.expectAnalyticsVisibleWithin(state, n));

Then("the analytics presenter emits within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) => analytics.expectAnalyticsEmits(state, n));
