import { describe, expect, it } from "vitest";

import type { EquityOrder } from "@rtc/domain";

import { newestUnseenId } from "./useNewestOrderId";

describe("newestUnseenId", () => {
  it("returns null when every order id was already seen", () => {
    const prevIds = new Set(["o1", "o2"]);

    expect(newestUnseenId(prevIds, [order("o1"), order("o2")])).toBeNull();
  });

  it("returns the single id appended since the previous set", () => {
    const prevIds = new Set(["o1"]);

    expect(newestUnseenId(prevIds, [order("o1"), order("o2")])).toBe("o2");
  });

  it("returns the LAST unseen id in array order when several appeared at once", () => {
    const prevIds = new Set(["o1"]);

    expect(
      newestUnseenId(prevIds, [order("o1"), order("o2"), order("o3")]),
    ).toBe("o3");
  });

  it("returns null for an empty orders array", () => {
    const prevIds = new Set(["o1"]);

    expect(newestUnseenId(prevIds, [])).toBeNull();
  });

  it("returns the only id when prevIds is empty", () => {
    const prevIds = new Set<string>();

    expect(newestUnseenId(prevIds, [order("o1")])).toBe("o1");
  });
});

function order(id: string): EquityOrder {
  return {
    id,
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 10,
    status: "working",
    filledQty: 0,
    createdAt: 0,
  };
}
