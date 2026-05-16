// tests/steps/presenter/cucumber-real/common.steps.ts
import { Given, When } from "@cucumber/cucumber";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";
import * as common from "../../../scenarios/presenter/cucumber-real/common";

Given("the trader has the workspace open",
  function(this: PresenterWorld) { return common.openWorkspace(this); });
Given("the trader has the FX workspace open",
  function(this: PresenterWorld) { return common.openFxWorkspace(this); });
Given("the credit workspace is open",
  function(this: PresenterWorld) { return common.openCreditWorkspace(this); });

When("the trader waits {int} seconds",
  function(this: PresenterWorld, n: number) { return common.waitSeconds(this, n); });
