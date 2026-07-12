import { EqBlotterHead, EqBlotterPanel } from "@ui-contract/components";
import {
  cleanupMounted,
  createWorld,
  mount,
  mountWith,
} from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityOrder, EquityPosition } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const POSITIONS: readonly EquityPosition[] = [
  {
    symbol: "AAPL",
    qty: 1000,
    avgPrice: 180,
    markPrice: 185,
    unrealisedPnl: 5000,
  },
  {
    symbol: "MSFT",
    qty: -500,
    avgPrice: 400,
    markPrice: 410,
    unrealisedPnl: -5000,
  },
];

describe("EqBlotterHead — tabs + live count", () => {
  it("defaults to the orders tab with a live order count", () => {
    const head = mount(EqBlotterHead, {
      equities: { orders: [order("eq-1"), order("eq-2"), order("eq-3")] },
    });

    expect(head.activeTab()).toBe("orders");
    expect(head.count()).toBe("3 orders");
  });

  it("shows the positions count once the positions tab is active", () => {
    const head = mount(EqBlotterHead, {
      equities: { positions: POSITIONS, blotterView: "positions" },
    });

    expect(head.activeTab()).toBe("positions");
    expect(head.count()).toBe("2 positions");
  });

  it("clicking a tab writes the shared eqBlotterView preference", async () => {
    const head = mount(EqBlotterHead, {
      equities: { orders: [order("eq-1")], positions: POSITIONS },
    });

    expect(head.activeTab()).toBe("orders");

    await head.selectPositions();
    expect(head.activeTab()).toBe("positions");
    expect(head.count()).toBe("2 positions");

    await head.selectOrders();
    expect(head.activeTab()).toBe("orders");
    expect(head.count()).toBe("1 orders");
  });
});

describe("EqBlotterHead + EqBlotterPanel — shared preference", () => {
  it("the head's tab click re-renders the panel's active table on the SAME world", async () => {
    const world = createWorld(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { orders: [order("eq-1"), order("eq-2")], positions: POSITIONS },
    );
    const head = mountWith(world, EqBlotterHead, {});
    const panel = mountWith(world, EqBlotterPanel, {});

    expect(panel.ordersRowCount()).toBe(2);
    expect(panel.positionsRowCount()).toBe(0);

    await head.selectPositions();

    expect(panel.ordersRowCount()).toBe(0);
    expect(panel.positionsRowCount()).toBe(2);
  });
});

function order(id: string): EquityOrder {
  return {
    id,
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 100,
    status: "working",
    filledQty: 0,
    createdAt: 0,
  };
}
