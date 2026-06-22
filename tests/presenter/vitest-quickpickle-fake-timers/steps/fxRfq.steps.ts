// tests/presenter/vitest-quickpickle-fake-timers/steps/fxRfq.steps.ts
import { Then, When } from "quickpickle";

import * as rfq from "#/presenter/scenarios/_shared/fxRfq";

import type { VitestFakePresenterWorld } from "../world";

When(
  "the trader sets the first tile notional to {string}",
  async (state: VitestFakePresenterWorld, value: string) => {
    return rfq.setFirstTileNotional(state, Number(value));
  },
);

When(
  "the trader requests an RFQ quote on the first tile",
  async (state: VitestFakePresenterWorld) => {
    return rfq.requestRfqQuoteOnFirstTile(state);
  },
);

Then(
  "an RFQ quote arrives within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) => {
    return rfq.expectRfqQuoteArrivesWithin(state, n);
  },
);
