import { Given, When } from "@cucumber/cucumber";
import * as common from "../scenarios/common";
import type { StepContext } from "../testContext";

Given("the trader has the workspace open", function (this: StepContext) {
  return common.openWorkspace(this.ctx);
});

Given("the trader has the FX workspace open", function (this: StepContext) {
  return common.openFxWorkspace(this.ctx);
});

Given("the credit workspace is open", function (this: StepContext) {
  return common.openCreditWorkspace(this.ctx);
});

When(
  "the trader switches to the {string} tab",
  function (this: StepContext, tab: string) {
    return common.clickTab(this.ctx, tab);
  },
);

When("the trader reloads the page", function (this: StepContext) {
  return common.reloadPage(this.ctx);
});
