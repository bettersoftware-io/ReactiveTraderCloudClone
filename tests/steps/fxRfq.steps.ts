import { Then, When } from "@cucumber/cucumber";
import type { StepContext } from "../support/testContext";
import * as fxRfq from "../scenarios/fxRfq";

Then("the RFQ initiation button appears within {int} seconds",
  function(this: StepContext, seconds: number) {
    return fxRfq.expectRfqInitiationButtonWithin(this.ctx, seconds);
  });

When("the trader clicks the RFQ initiation button",
  function(this: StepContext) { return fxRfq.clickRfqInitiationButton(this.ctx); });

Then("a countdown or quote indicator appears within {int} seconds",
  function(this: StepContext, seconds: number) {
    return fxRfq.expectCountdownOrQuoteWithin(this.ctx, seconds);
  });
