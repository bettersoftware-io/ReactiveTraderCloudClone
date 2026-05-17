// tests/steps/presenter/vitest-fake/common.steps.ts
import { Given, When } from "quickpickle";
import type { VitestFakePresenterWorld } from "../../../support/presenter/vitest-fake/world";
import * as common from "../../../scenarios/presenter/_shared/common";

Given("the trader has the workspace open",
  async (state: VitestFakePresenterWorld) => common.openWorkspace(state));
Given("the trader has the FX workspace open",
  async (state: VitestFakePresenterWorld) => common.openFxWorkspace(state));
Given("the credit workspace is open",
  async (state: VitestFakePresenterWorld) => common.openCreditWorkspace(state));

When("the trader waits {int} seconds",
  async (state: VitestFakePresenterWorld, n: number) => state.waitSeconds(n));
