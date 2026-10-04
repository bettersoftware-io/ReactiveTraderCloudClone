import { afterEach, beforeEach, describe, it } from "vitest";

import * as analytics from "../scenarios/_shared/analytics.ts";
import * as fx from "../scenarios/_shared/fxLiveRates.ts";
import {
  buildWorld,
  teardownWorld,
  type VitestPlainPresenterWorld,
} from "./_world.ts";

describe("@presenter Feature: Analytics panel", () => {
  beforeEach(() => {
    w = buildWorld();
  });
  afterEach(() => {
    teardownWorld(w);
  });

  it("analytics panel shows alongside live rates", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await analytics.expectAnalyticsVisibleWithin(w, 5);
  });

  it("analytics presenter emits a non-empty snapshot", async () => {
    await analytics.expectAnalyticsEmits(w, 5);
  });

  let w: VitestPlainPresenterWorld;
});
