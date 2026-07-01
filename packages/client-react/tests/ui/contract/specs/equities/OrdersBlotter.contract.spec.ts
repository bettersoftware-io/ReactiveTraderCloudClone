import { OrdersBlotter } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityOrder } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const ORDERS: readonly EquityOrder[] = [
  {
    id: "o1",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 100,
    status: "working",
    filledQty: 0,
    createdAt: 0,
  },
  {
    id: "o2",
    symbol: "MSFT",
    side: "sell",
    type: "limit",
    limitPrice: 200,
    qty: 50,
    status: "filled",
    filledQty: 50,
    avgPrice: 199.5,
    createdAt: 0,
  },
];

describe("OrdersBlotter", () => {
  it("shows an empty-state placeholder when there are no orders", () => {
    const blotter = mount(OrdersBlotter, {});

    expect(blotter.rowCount()).toBe(0);
    expect(blotter.isEmpty()).toBe(true);
  });

  it("renders a row per order, painting each order's status", () => {
    const blotter = mount(OrdersBlotter, { equities: { orders: ORDERS } });

    expect(blotter.rowCount()).toBe(2);
    expect(blotter.statusOf("o1")).toBe("working");
    expect(blotter.statusOf("o2")).toBe("filled");
  });
});
