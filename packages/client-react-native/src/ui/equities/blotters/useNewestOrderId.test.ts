import { describe, expect, test } from "vitest";

import type { EquityOrder } from "@rtc/domain";

import { newestUnseenId } from "./useNewestOrderId";

describe("newestUnseenId", () => {
  test("returns the last id absent from the previous set", () => {
    expect(
      newestUnseenId(new Set(["a"]), [order("a"), order("b"), order("c")]),
    ).toBe("c");
  });

  test("returns null when nothing is new", () => {
    expect(newestUnseenId(new Set(["a", "b"]), [order("a"), order("b")])).toBe(
      null,
    );
  });

  test("an empty previous set makes the last order newest", () => {
    expect(newestUnseenId(new Set(), [order("a"), order("b")])).toBe("b");
  });
});

function order(id: string): EquityOrder {
  return {
    id,
    symbol: "NVDA",
    side: "buy",
    type: "market",
    qty: 500,
    status: "working",
    filledQty: 0,
    createdAt: 0,
  };
}
