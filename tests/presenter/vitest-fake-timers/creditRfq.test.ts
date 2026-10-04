import { afterEach, beforeEach, describe, it } from "vitest";

import * as credit from "../scenarios/_shared/creditRfq.ts";
import {
  buildWorld,
  teardownWorld,
  type VitestPlainPresenterWorld,
} from "./_world.ts";

describe("@presenter Feature: Credit RFQ", () => {
  beforeEach(() => {
    w = buildWorld();
  });
  afterEach(() => {
    teardownWorld(w);
  });

  it("credit RFQ list is empty when no RFQs have been created", async () => {
    await credit.expectRfqListEmptyWithin(w, 3);
  });

  let w: VitestPlainPresenterWorld;
});
