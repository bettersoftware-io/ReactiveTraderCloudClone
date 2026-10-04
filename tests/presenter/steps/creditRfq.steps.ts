// tests/presenter/steps/creditRfq.steps.ts
import { Then } from "@cucumber/cucumber";

import type { PresenterWorld } from "../cucumber-fake-timers/world.ts";
import * as credit from "../scenarios/_shared/creditRfq.ts";

Then(
  "the credit RFQ list is empty within {int} seconds",
  function creditRfqListEmptyWithin(this: PresenterWorld, n: number) {
    return credit.expectRfqListEmptyWithin(this, n);
  },
);
