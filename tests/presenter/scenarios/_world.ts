// tests/presenter/scenarios/_world.ts

import type { AwaitHelpers } from "./_await";
import type { PresenterCtx } from "./_buildApp";
import type { PresenterScratchpad } from "./_shared/common";

export type PresenterWorld = AwaitHelpers & {
  ctx: PresenterCtx;
  scratch: PresenterScratchpad;
};
