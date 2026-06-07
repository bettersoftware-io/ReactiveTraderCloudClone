import { describe, beforeEach, afterEach, it } from "vitest";
import { buildWorld, teardownWorld, type VitestPlainPresenterWorld } from "./_world";
import * as fx from "../scenarios/_shared/fxLiveRates";
import * as analytics from "../scenarios/_shared/analytics";

describe("@presenter Feature: Analytics panel", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => { w = buildWorld(); });
  afterEach(() => { teardownWorld(w); });

  it("analytics panel shows alongside live rates", async () => {
    await fx.expectPriceTileVisibleWithin(w, 5);
    await analytics.expectAnalyticsVisibleWithin(w, 5);
  });

  it("analytics presenter emits a non-empty snapshot", async () => {
    await analytics.expectAnalyticsEmits(w, 5);
  });
});
