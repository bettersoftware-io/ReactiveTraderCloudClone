// tests/scenarios/presenter/_world.ts
import type { PresenterCtx } from "./_buildApp";
import type { PresenterScratchpad } from "./_shared/common";
import type { AwaitHelpers } from "./_await";

export type PresenterWorld = AwaitHelpers & {
  ctx: PresenterCtx;
  scratch: PresenterScratchpad;
};
