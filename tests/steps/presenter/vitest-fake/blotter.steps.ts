// tests/steps/presenter/vitest-fake/blotter.steps.ts
import { Then } from "quickpickle";
import type { VitestFakePresenterWorld } from "../../../support/presenter/vitest-fake/world";
import * as blotter from "../../../scenarios/presenter/_shared/blotter";

Then("the blotter table is visible", async (state: VitestFakePresenterWorld) =>
  blotter.expectBlotterVisible(state));

Then("the blotter has at least {int} row", async (state: VitestFakePresenterWorld, n: number) =>
  blotter.expectBlotterHasAtLeastNRows(state, n));

Then("the blotter has at least {int} rows", async (state: VitestFakePresenterWorld, n: number) =>
  blotter.expectBlotterHasAtLeastNRows(state, n));
