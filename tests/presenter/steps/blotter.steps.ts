// tests/presenter/steps/blotter.steps.ts
import { Then } from "@cucumber/cucumber";

import type { PresenterWorld } from "../cucumber-fake-timers/world";
import * as blotter from "../scenarios/_shared/blotter";

Then(
  "the blotter table is visible",
  function blotterTableVisible(this: PresenterWorld) {
    return blotter.expectBlotterVisible(this);
  },
);

Then(
  "the blotter has at least {int} row",
  function blotterHasAtLeastNRow(this: PresenterWorld, n: number) {
    return blotter.expectBlotterHasAtLeastNRows(this, n);
  },
);

Then(
  "the blotter has at least {int} rows",
  function blotterHasAtLeastNRows(this: PresenterWorld, n: number) {
    return blotter.expectBlotterHasAtLeastNRows(this, n);
  },
);
