// tests/presenter/steps/blotter.steps.ts
import { Then } from "@cucumber/cucumber";

import type { PresenterWorld } from "../cucumber/world";
import * as blotter from "../scenarios/_shared/blotter";

Then("the blotter table is visible", function (this: PresenterWorld) {
  return blotter.expectBlotterVisible(this);
});

Then(
  "the blotter has at least {int} row",
  function (this: PresenterWorld, n: number) {
    return blotter.expectBlotterHasAtLeastNRows(this, n);
  },
);

Then(
  "the blotter has at least {int} rows",
  function (this: PresenterWorld, n: number) {
    return blotter.expectBlotterHasAtLeastNRows(this, n);
  },
);
