import { describe, expect, test } from "vitest";

import { rfqCardVm } from "#/credit/rfqCardVm";
import type { Rfq } from "#/credit/types";

describe("rfqCardVm", () => {
  test("marks the lowest price best for a Buy and formats prices", () => {
    const vm = rfqCardVm(openBuy(), 1_000_000);
    expect(vm.stateLabel).toBe("LIVE");
    expect(vm.quotes[0].best).toBe(true);
    expect(vm.quotes[0].priceText).toBe("$99.50");
    expect(vm.quotes[1].best).toBe(false);
    expect(
      vm.quotes.every((q) => {
        return q.canAccept;
      }),
    ).toBe(true);
  });

  test("counts down secs from createdAt+expiry", () => {
    const r = openBuy();
    const vm = rfqCardVm(r, r.createdAt + 30_000);
    expect(vm.secs).toBe(90);
  });
});

function openBuy(): Rfq {
  const now = 1_000_000;
  return {
    id: 701,
    state: "Open",
    dir: "Buy",
    instrumentId: 2,
    qty: 500_000,
    dealerIds: [1, 2],
    acceptedDealerId: null,
    createdAt: now,
    expirySecs: 120,
    quotes: [
      { dealerId: 1, state: "priced", price: 99.5 },
      { dealerId: 2, state: "priced", price: 99.8 },
    ],
  };
}
