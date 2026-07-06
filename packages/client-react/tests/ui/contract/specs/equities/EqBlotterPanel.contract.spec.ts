import { act } from "@testing-library/react";
import { EqBlotterPanel } from "@ui-contract/components";
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
];

describe("EqBlotterPanel — view selection", () => {
  it("renders OrdersTable by default (DEFAULT_EQ_BLOTTER_VIEW is orders)", () => {
    const panel = mount(EqBlotterPanel, {
      equities: { orders: [order({ id: "eq-1" }), order({ id: "eq-2" })] },
    });

    expect(panel.ordersRowCount()).toBe(2);
    expect(panel.positionsRowCount()).toBe(0);
  });

  it("renders PositionsTable when the blotterView preference is positions", () => {
    const panel = mount(EqBlotterPanel, {
      equities: { positions: POSITIONS, blotterView: "positions" },
    });

    expect(panel.positionsRowCount()).toBe(1);
    expect(panel.ordersRowCount()).toBe(0);
  });
});

describe("EqBlotterPanel — data-new flash (id-set diff)", () => {
  it("does not flash any row on the initial mount", () => {
    const panel = mount(EqBlotterPanel, {
      equities: { orders: [order({ id: "eq-1" }), order({ id: "eq-2" })] },
    });

    expect(panel.isNewOrder("eq-1")).toBe(false);
    expect(panel.isNewOrder("eq-2")).toBe(false);
  });

  it("flags the newly appeared order after a push, and moves the flag when another appears", () => {
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
      { orders: [order({ id: "eq-1" })] },
    );
    const panel = mountWith(world, EqBlotterPanel, {});

    expect(panel.isNewOrder("eq-1")).toBe(false);

    act(() => {
      world.setEquityOrders([order({ id: "eq-1" }), order({ id: "eq-2" })]);
    });

    expect(panel.isNewOrder("eq-1")).toBe(false);
    expect(panel.isNewOrder("eq-2")).toBe(true);

    act(() => {
      world.setEquityOrders([
        order({ id: "eq-1" }),
        order({ id: "eq-2" }),
        order({ id: "eq-3" }),
      ]);
    });

    expect(panel.isNewOrder("eq-2")).toBe(false);
    expect(panel.isNewOrder("eq-3")).toBe(true);
  });

  it("a status-only update on the same ids is not treated as a new order", () => {
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
      { orders: [order({ id: "eq-1", status: "new" })] },
    );
    const panel = mountWith(world, EqBlotterPanel, {});

    act(() => {
      world.setEquityOrders([order({ id: "eq-1", status: "filled" })]);
    });

    expect(panel.isNewOrder("eq-1")).toBe(false);
  });
});

function order(overrides: Partial<EquityOrder> = {}): EquityOrder {
  return {
    id: "eq-1",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 100,
    status: "working",
    filledQty: 0,
    createdAt: 0,
    ...overrides,
  };
}
