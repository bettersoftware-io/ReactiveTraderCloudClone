// tests/presenter/vitest-quickpickle-fake-timers/steps/common.steps.ts
import { Given, When } from "quickpickle";

import * as common from "../../scenarios/_shared/common";
import type { VitestFakePresenterWorld } from "../world";

Given(
  "the trader has the workspace open",
  async (state: VitestFakePresenterWorld) => common.openWorkspace(state),
);
Given(
  "the trader has the FX workspace open",
  async (state: VitestFakePresenterWorld) => common.openFxWorkspace(state),
);
Given("the credit workspace is open", async (state: VitestFakePresenterWorld) =>
  common.openCreditWorkspace(state),
);

When(
  "the trader waits {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) => state.waitSeconds(n),
);
