import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import type { EqBlotView } from "#/equities/Blotter/EqBlotterPanel";
import {
  EqBlotterPanel,
  EqBlotterPanelControls,
} from "#/equities/Blotter/EqBlotterPanel";
import type { EqOrder } from "#/equities/types";

afterEach(cleanup);

const ORDERS: EqOrder[] = [
  {
    id: 5001,
    time: "09:30:01",
    sym: "AAPL",
    side: "Buy",
    type: "Market",
    qty: 100,
    price: 230,
    status: "Filled",
  },
];

describe("EqBlotterPanel", () => {
  test("shows the orders empty state, then a row, and the 7 order headers", () => {
    const { container, getByText, rerender } = render(
      <EqBlotterPanel
        orders={[]}
        positions={[]}
        view="orders"
        newOrderId={null}
      />,
    );
    expect(getByText(/No orders/)).toBeTruthy();

    rerender(
      <EqBlotterPanel
        orders={ORDERS}
        positions={[]}
        view="orders"
        newOrderId={5001}
      />,
    );
    expect(container.querySelector('[data-order-id="5001"]')).toBeTruthy();

    for (const label of [
      "Time",
      "Symbol",
      "Side",
      "Type",
      "Qty",
      "Price",
      "Status",
    ]) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  test("the positions view shows its empty state", () => {
    const { getByText } = render(
      <EqBlotterPanel
        orders={[]}
        positions={[]}
        view="positions"
        newOrderId={null}
      />,
    );
    expect(getByText(/No open positions/)).toBeTruthy();
  });
});

describe("EqBlotterPanelControls", () => {
  test("shows the live count and calls onView when a tab is clicked", () => {
    let view: EqBlotView = "orders";

    function handleView(next: EqBlotView): void {
      view = next;
    }

    const { getByText, rerender } = render(
      <EqBlotterPanelControls
        view={view}
        onView={handleView}
        ordersCount={3}
        positionsCount={2}
      />,
    );
    expect(getByText("3 orders")).toBeTruthy();

    fireEvent.click(getByText(/Positions/));
    expect(view).toBe("positions");

    rerender(
      <EqBlotterPanelControls
        view={view}
        onView={handleView}
        ordersCount={3}
        positionsCount={2}
      />,
    );
    expect(getByText("2 positions")).toBeTruthy();
  });
});
