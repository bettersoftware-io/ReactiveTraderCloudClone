// tests/presenter/vitest-quickpickle-fake-timers/steps/creditRfq.steps.ts
import { Then } from "quickpickle";

import * as credit from "#/presenter/scenarios/_shared/creditRfq";

import type { VitestFakePresenterWorld } from "../world";

Then(
  "the credit RFQ list is empty within {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) =>
    credit.expectRfqListEmptyWithin(state, n),
);
