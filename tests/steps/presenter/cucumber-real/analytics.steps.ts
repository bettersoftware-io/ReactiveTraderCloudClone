// tests/steps/presenter/cucumber-real/analytics.steps.ts
import { Then } from "@cucumber/cucumber";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
import * as analytics from "../../../scenarios/presenter/cucumber-real/analytics";

Then("the analytics panel is visible within {int} seconds",
  function(this: PresenterWorld, n: number) { return analytics.expectAnalyticsVisibleWithin(this, n); });

Then("the analytics presenter emits within {int} seconds",
  function(this: PresenterWorld, n: number) { return analytics.expectAnalyticsEmits(this, n); });
