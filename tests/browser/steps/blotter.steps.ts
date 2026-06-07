import { Then, When } from "@cucumber/cucumber";
import type { StepContext } from "../testContext";
import * as blotter from "../scenarios/blotter";

When("the trader clicks the first blotter header",
  function(this: StepContext) { return blotter.clickFirstBlotterHeader(this.ctx); });

When("the trader records the blotter row count as {string}",
  function(this: StepContext, key: string) { return blotter.recordBlotterRowCount(this.ctx, key); });

When("the trader sets the blotter quick filter to {string}",
  function(this: StepContext, text: string) { return blotter.setBlotterQuickFilter(this.ctx, text); });

When("the trader clears the blotter quick filter",
  function(this: StepContext) { return blotter.clearBlotterQuickFilter(this.ctx); });

Then("the blotter row count is at most {string}",
  function(this: StepContext, key: string) { return blotter.expectBlotterRowCountAtMost(this.ctx, key); });

Then("the blotter row count equals {string}",
  function(this: StepContext, key: string) { return blotter.expectBlotterRowCountEquals(this.ctx, key); });

Then("the export CSV button is visible",
  function(this: StepContext) { return blotter.expectExportCsvVisible(this.ctx); });

Then("the export CSV button text contains {string}",
  function(this: StepContext, expected: string) { return blotter.expectExportCsvTextContains(this.ctx, expected); });

Then("the first blotter row is visible",
  function(this: StepContext) { return blotter.expectFirstBlotterRowVisible(this.ctx); });

Then("the first blotter row background color is non-empty",
  function(this: StepContext) { return blotter.expectFirstBlotterRowBackgroundNonEmpty(this.ctx); });

When("the trader hovers the first blotter row",
  function(this: StepContext) { return blotter.hoverFirstBlotterRow(this.ctx); });

When("the trader buys {int} times with confirmation dismissals",
  function(this: StepContext, n: number) { return blotter.buyNTimesWithDismissals(this.ctx, n); });
