// tests/presenter/scenarios/_world.ts

import type { AwaitHelpers } from "./_await.ts";
import type { PresenterCtx } from "./_buildApp.ts";
import type { PresenterScratchpad } from "./_shared/common.ts";

export type PresenterWorld = AwaitHelpers & {
  ctx: PresenterCtx;
  scratch: PresenterScratchpad;
};
