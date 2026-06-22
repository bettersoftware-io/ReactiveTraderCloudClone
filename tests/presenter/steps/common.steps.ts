// tests/presenter/steps/common.steps.ts
import { Given, When } from "@cucumber/cucumber";

import type { PresenterWorld } from "../cucumber/world";
import * as common from "../scenarios/_shared/common";

Given(
  "the trader has the workspace open",
  function traderHasWorkspaceOpen(this: PresenterWorld) {
    return common.openWorkspace(this);
  },
);
Given(
  "the trader has the FX workspace open",
  function traderHasFxWorkspaceOpen(this: PresenterWorld) {
    return common.openFxWorkspace(this);
  },
);
Given(
  "the credit workspace is open",
  function creditWorkspaceIsOpen(this: PresenterWorld) {
    return common.openCreditWorkspace(this);
  },
);

When(
  "the trader waits {int} seconds",
  function traderWaitsSeconds(this: PresenterWorld, n: number) {
    return this.waitSeconds(n);
  },
);
