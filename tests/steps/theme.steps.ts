import { Then, When } from "@cucumber/cucumber";
import type { StepContext } from "../support/testContext";
import * as theme from "../scenarios/theme";

When("the trader toggles the theme",
  function(this: StepContext) { return theme.toggleAndCaptureBackgrounds(this.ctx); });

Then("the theme toggle button is visible",
  function(this: StepContext) { return theme.expectThemeToggleVisible(this.ctx); });

Then("the workspace background color has changed",
  function(this: StepContext) { return theme.expectBackgroundChanged(this.ctx); });

Then("the workspace background color matches the toggled theme",
  function(this: StepContext) { return theme.expectBackgroundMatchesToggled(this.ctx); });

Then("the theme toggle aria-label mentions {string}",
  function(this: StepContext, term: string) {
    return theme.expectThemeToggleAriaLabelMentions(this.ctx, term);
  });

Then("a price tile is visible",
  function(this: StepContext) { return theme.expectFirstPriceTileVisible(this.ctx, 5_000); });

Then("the credit navigation is visible",
  function(this: StepContext) { return theme.expectCreditNavVisible(this.ctx); });
