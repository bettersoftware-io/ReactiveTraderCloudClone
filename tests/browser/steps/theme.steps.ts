import { Then, When } from "@cucumber/cucumber";

import * as theme from "../scenarios/theme";
import type { StepContext } from "../testContext";

When("the trader toggles the theme", function toggleTheme(this: StepContext) {
  return theme.toggleAndCaptureBackgrounds(this.ctx);
});

Then(
  "the theme toggle button is visible",
  function expectThemeToggleVisible(this: StepContext) {
    return theme.expectThemeToggleVisible(this.ctx);
  },
);

Then(
  "the workspace background color has changed",
  function expectBackgroundChanged(this: StepContext) {
    return theme.expectBackgroundChanged(this.ctx);
  },
);

Then(
  "the workspace background color matches the toggled theme",
  function expectBackgroundMatchesToggled(this: StepContext) {
    return theme.expectBackgroundMatchesToggled(this.ctx);
  },
);

Then(
  "the theme toggle aria-label mentions {string}",
  function expectThemeToggleAriaLabelMentions(this: StepContext, term: string) {
    return theme.expectThemeToggleAriaLabelMentions(this.ctx, term);
  },
);

Then(
  "a price tile is visible",
  function expectFirstPriceTileVisible(this: StepContext) {
    return theme.expectFirstPriceTileVisible(this.ctx, 5_000);
  },
);

Then(
  "the credit dock is visible",
  function expectCreditDockVisible(this: StepContext) {
    return theme.expectCreditDockVisible(this.ctx);
  },
);
