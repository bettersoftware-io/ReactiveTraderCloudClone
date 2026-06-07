// tests/presenter/steps/creditRfq.steps.ts
import { Then } from "@cucumber/cucumber";
import type { PresenterWorld } from "../cucumber/world";
import * as credit from "../scenarios/_shared/creditRfq";

Then("the credit RFQ list is empty within {int} seconds",
  function(this: PresenterWorld, n: number) { return credit.expectRfqListEmptyWithin(this, n); });
