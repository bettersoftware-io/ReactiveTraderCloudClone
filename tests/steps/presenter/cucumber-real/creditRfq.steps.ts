// tests/steps/presenter/cucumber-real/creditRfq.steps.ts
import { Then } from "@cucumber/cucumber";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
import * as credit from "../../../scenarios/presenter/_shared/creditRfq";

Then("the credit RFQ list is empty within {int} seconds",
  function(this: PresenterWorld, n: number) { return credit.expectRfqListEmptyWithin(this, n); });
