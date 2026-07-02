import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { EqBlotterPanel } from "#/equities/Blotter/EqBlotterPanel";
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
        onView={noop}
        newOrderId={null}
      />,
    );
    expect(getByText(/No orders/)).toBeTruthy();

    rerender(
      <EqBlotterPanel
        orders={ORDERS}
        positions={[]}
        view="orders"
        onView={noop}
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
        onView={noop}
        newOrderId={null}
      />,
    );
    expect(getByText(/No open positions/)).toBeTruthy();
  });
});

function noop(): void {}
