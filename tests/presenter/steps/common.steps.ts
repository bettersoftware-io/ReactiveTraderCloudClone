// tests/presenter/steps/common.steps.ts
import { Given, When } from "@cucumber/cucumber";

import type { PresenterWorld } from "../cucumber-fake-timers/world";

// "Opening a workspace" is a UI-only concept — at the presenter tier the app is
// already built live in the Before hook (buildPresenterApp), so these Given
// steps are narrative no-ops. (They used to call no-op helpers in
// _shared/common.ts; those were removed as dead code when the winner peer,
// which never opens a workspace, became the sole gating presenter runner.)
Given(
  "the trader has the workspace open",
  function traderHasWorkspaceOpen(this: PresenterWorld) {},
);
Given(
  "the trader has the FX workspace open",
  function traderHasFxWorkspaceOpen(this: PresenterWorld) {},
);
Given(
  "the credit workspace is open",
  function creditWorkspaceIsOpen(this: PresenterWorld) {},
);

When(
  "the trader waits {int} seconds",
  function traderWaitsSeconds(this: PresenterWorld, n: number) {
    return this.waitSeconds(n);
  },
);
