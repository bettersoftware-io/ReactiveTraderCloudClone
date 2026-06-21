// tests/presenter/vitest-quickpickle-fake-timers/steps/blotter.steps.ts
import { Then } from "quickpickle";
import * as blotter from "../../scenarios/_shared/blotter";
import type { VitestFakePresenterWorld } from "../world";

Then("the blotter table is visible", async (state: VitestFakePresenterWorld) =>
  blotter.expectBlotterVisible(state),
);

Then(
  "the blotter has at least {int} row",
  async (state: VitestFakePresenterWorld, n: number) =>
    blotter.expectBlotterHasAtLeastNRows(state, n),
);

Then(
  "the blotter has at least {int} rows",
  async (state: VitestFakePresenterWorld, n: number) =>
    blotter.expectBlotterHasAtLeastNRows(state, n),
);
