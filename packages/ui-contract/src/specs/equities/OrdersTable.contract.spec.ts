import { OrdersTable } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityOrder, OrderStatus } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("OrdersTable — empty state", () => {
  it("shows a placeholder when there are no orders", () => {
    const table = mount(OrdersTable, {
      props: { orders: [], newOrderId: null },
    });

    expect(table.rowCount()).toBe(0);
    expect(table.isEmpty()).toBe(true);
  });
});

describe("OrdersTable — status display map", () => {
  const cases: ReadonlyArray<[OrderStatus, string]> = [
    ["new", "Working"],
    ["working", "Working"],
    ["partiallyFilled", "Partial"],
    ["filled", "Filled"],
    ["cancelled", "Cancelled"],
    ["rejected", "Rejected"],
  ];

  for (const [status, label] of cases) {
    it(`maps "${status}" to "${label}"`, () => {
      const table = mount(OrdersTable, {
        props: { orders: [order({ status })], newOrderId: null },
      });

      expect(table.statusOf("eq-1")).toBe(status);
      expect(table.statusTextOf("eq-1")).toBe(label);
    });
  }
});

describe("OrdersTable — qty format", () => {
  it("shows filledQty/qty when partially filled", () => {
    const table = mount(OrdersTable, {
      props: {
        orders: [order({ status: "partiallyFilled", qty: 100, filledQty: 40 })],
        newOrderId: null,
      },
    });

    expect(table.qtyTextOf("eq-1")).toBe("40/100");
  });

  for (const status of [
    "new",
    "working",
    "filled",
    "cancelled",
    "rejected",
  ] as const) {
    it(`shows plain qty for status "${status}"`, () => {
      const table = mount(OrdersTable, {
        props: {
          orders: [order({ status, qty: 250, filledQty: 250 })],
          newOrderId: null,
        },
      });

      expect(table.qtyTextOf("eq-1")).toBe("250");
    });
  }
});

describe("OrdersTable — price fallback chain", () => {
  it("prefers avgPrice when present", () => {
    const table = mount(OrdersTable, {
      props: {
        orders: [order({ avgPrice: 199.5, limitPrice: 200, status: "filled" })],
        newOrderId: null,
      },
    });

    expect(table.priceTextOf("eq-1")).toBe("$199.50");
  });

  it("falls back to limitPrice when avgPrice is absent", () => {
    const table = mount(OrdersTable, {
      props: {
        orders: [order({ limitPrice: 200, type: "limit" })],
        newOrderId: null,
      },
    });

    expect(table.priceTextOf("eq-1")).toBe("$200.00");
  });

  it("shows an em dash when neither avgPrice nor limitPrice is set", () => {
    const table = mount(OrdersTable, {
      props: { orders: [order({ type: "market" })], newOrderId: null },
    });

    expect(table.priceTextOf("eq-1")).toBe("—");
  });
});

describe("OrdersTable — side/type display + time", () => {
  it("capitalizes side and type for display while the domain values stay lowercase", () => {
    const table = mount(OrdersTable, {
      props: {
        orders: [order({ side: "sell", type: "limit", limitPrice: 10 })],
        newOrderId: null,
      },
    });

    expect(table.sideTextOf("eq-1")).toBe("Sell");
    expect(table.typeTextOf("eq-1")).toBe("Limit");
  });

  it("renders HH:MM:SS from createdAt", () => {
    const table = mount(OrdersTable, {
      props: {
        orders: [order({ createdAt: Date.UTC(2026, 0, 1, 9, 5, 3) })],
        newOrderId: null,
      },
    });

    const d = new Date(Date.UTC(2026, 0, 1, 9, 5, 3));
    const expected = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => {
        return String(n).padStart(2, "0");
      })
      .join(":");

    expect(table.timeTextOf("eq-1")).toBe(expected);
  });
});

describe("OrdersTable — data-new flash", () => {
  it("flashes only the row matching newOrderId", () => {
    const table = mount(OrdersTable, {
      props: {
        orders: [order({ id: "eq-1" }), order({ id: "eq-2" })],
        newOrderId: "eq-2",
      },
    });

    expect(table.isNew("eq-1")).toBe(false);
    expect(table.isNew("eq-2")).toBe(true);
  });

  it("flashes no row when newOrderId is null", () => {
    const table = mount(OrdersTable, {
      props: { orders: [order({ id: "eq-1" })], newOrderId: null },
    });

    expect(table.isNew("eq-1")).toBe(false);
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
    createdAt: Date.UTC(2026, 0, 1, 9, 5, 3),
    ...overrides,
  };
}
