// tests/presenter/vitest-fake-timers/steps/creditRfq.steps.ts
import { Then } from "quickpickle";
import type { VitestFakePresenterWorld } from "../world";
import * as credit from "../../scenarios/_shared/creditRfq";

Then("the credit RFQ list is empty within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) => credit.expectRfqListEmptyWithin(state, n));
