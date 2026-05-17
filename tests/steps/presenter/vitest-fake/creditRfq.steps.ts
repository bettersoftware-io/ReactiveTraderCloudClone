// tests/steps/presenter/vitest-fake/creditRfq.steps.ts
import { Then } from "quickpickle";
import type { VitestFakePresenterWorld } from "../../../support/presenter/vitest-fake/world";
import * as credit from "../../../scenarios/presenter/_shared/creditRfq";

Then("the credit RFQ list is empty within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) => credit.expectRfqListEmptyWithin(state, n));
