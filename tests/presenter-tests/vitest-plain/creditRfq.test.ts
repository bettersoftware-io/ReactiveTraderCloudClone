import { describe, beforeEach, afterEach, it } from "vitest";
import { buildWorld, teardownWorld, type VitestPlainPresenterWorld } from "./_world";
import * as credit from "../../scenarios/presenter/_shared/creditRfq";

describe("@presenter Feature: Credit RFQ", () => {
  let w: VitestPlainPresenterWorld;
  beforeEach(() => { w = buildWorld(); });
  afterEach(() => { teardownWorld(w); });

  it("credit RFQ list is empty when no RFQs have been created", async () => {
    await credit.expectRfqListEmptyWithin(w, 3);
  });
});
