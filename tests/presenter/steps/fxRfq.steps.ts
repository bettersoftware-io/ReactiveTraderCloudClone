// tests/presenter/steps/fxRfq.steps.ts
import { Then, When } from "@cucumber/cucumber";

import type { PresenterWorld } from "../cucumber/world";
import * as rfq from "../scenarios/_shared/fxRfq";

When(
  "the trader sets the first tile notional to {string}",
  function traderSetsFirstTileNotional(this: PresenterWorld, value: string) {
    return rfq.setFirstTileNotional(this, Number(value));
  },
);

When(
  "the trader requests an RFQ quote on the first tile",
  function traderRequestsRfqQuoteOnFirstTile(this: PresenterWorld) {
    return rfq.requestRfqQuoteOnFirstTile(this);
  },
);

Then(
  "an RFQ quote arrives within {int} seconds",
  function rfqQuoteArrivesWithin(this: PresenterWorld, n: number) {
    return rfq.expectRfqQuoteArrivesWithin(this, n);
  },
);
