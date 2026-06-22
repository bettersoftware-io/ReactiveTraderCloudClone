import { Then, When } from "@cucumber/cucumber";

import * as fxRfq from "../scenarios/fxRfq";
import type { StepContext } from "../testContext";

Then(
  "the RFQ initiation button appears within {int} seconds",
  function expectRfqInitiationButtonWithin(this: StepContext, seconds: number) {
    return fxRfq.expectRfqInitiationButtonWithin(this.ctx, seconds);
  },
);

When(
  "the trader clicks the RFQ initiation button",
  function clickRfqInitiationButton(this: StepContext) {
    return fxRfq.clickRfqInitiationButton(this.ctx);
  },
);

When(
  "the trader requests an RFQ quote on the first tile",
  function requestRfqQuoteOnFirstTile(this: StepContext) {
    return fxRfq.clickRfqInitiationButton(this.ctx);
  },
);

Then(
  "a countdown or quote indicator appears within {int} seconds",
  function expectCountdownOrQuoteWithin(this: StepContext, seconds: number) {
    return fxRfq.expectCountdownOrQuoteWithin(this.ctx, seconds);
  },
);

Then(
  "an RFQ quote arrives within {int} seconds",
  function expectRfqQuoteArrivesWithin(this: StepContext, seconds: number) {
    return fxRfq.expectCountdownOrQuoteWithin(this.ctx, seconds);
  },
);
