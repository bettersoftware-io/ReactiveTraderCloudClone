import { describe, expect, it } from "vitest";

import type { PlaceOrderRequest } from "@rtc/domain";

import { collect } from "#/harness/collect";
import { createEquityOrder } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

const REQUEST: PlaceOrderRequest = {
  symbol: "AAPL",
  side: "buy",
  type: "limit",
  qty: 100,
  limitPrice: 190,
};

export function describeOrdersBlotterContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("orders$ delivers the book the port holds, and replays it synchronously to a late subscriber", async () => {
      const h = makeHarness();

      try {
        const resting = createEquityOrder({ id: "ord-0" });
        h.driver.setOrderBook([resting]);
        const c = collect(h.app.presenters.ordersBlotter.orders$);
        await settle();
        expect(c.values.at(-1)).toEqual([resting]);
        const late = collect(h.app.presenters.ordersBlotter.orders$);
        expect(late.values).toEqual([[resting]]);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("place() is lazy, passes the request through verbatim, delivers each lifecycle update in order, and an unsubscribe withdraws the order", async () => {
      const h = makeHarness();

      try {
        const result = h.app.presenters.ordersBlotter.place(REQUEST);
        expect(h.driver.pendingOrders()).toEqual([]);
        const c = collect(result);
        await settle();
        expect(h.driver.pendingOrders()).toEqual([REQUEST]);
        const working = createEquityOrder({ status: "working" });
        const partial = createEquityOrder({
          status: "partiallyFilled",
          filledQty: 40,
        });
        h.driver.emitOrderUpdate(working);
        await settle();
        h.driver.emitOrderUpdate(partial);
        await settle();
        expect(c.values).toEqual([working, partial]);
        c.unsubscribe();
        await settle();
        expect(h.driver.pendingOrders()).toEqual([]);
      } finally {
        await h.teardown();
      }
    });

    it("every lifecycle update re-queries the book: orders$ shows what the port holds after it", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.ordersBlotter;
        const orders = collect(p.orders$);
        await settle();
        expect(orders.values.at(-1)).toEqual([]);
        const placed = collect(p.place(REQUEST));
        await settle();
        const working = createEquityOrder({ status: "working" });
        h.driver.setOrderBook([working]);
        h.driver.emitOrderUpdate(working);
        await settle();
        expect(orders.values.at(-1)).toEqual([working]);
        orders.unsubscribe();
        placed.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("fills$ emits the symbol once when an order reaches filled — not before — and does not replay to a late subscriber", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.ordersBlotter;
        const fills = collect(p.fills$);
        await settle();
        const placed = collect(p.place(REQUEST));
        await settle();
        h.driver.emitOrderUpdate(createEquityOrder({ status: "working" }));
        await settle();
        h.driver.emitOrderUpdate(
          createEquityOrder({ status: "partiallyFilled", filledQty: 40 }),
        );
        await settle();
        expect(fills.values).toEqual([]);
        h.driver.emitOrderUpdate(
          createEquityOrder({ status: "filled", filledQty: 100 }),
        );
        await settle();
        expect(fills.values).toEqual([{ symbol: "AAPL" }]);
        const late = collect(p.fills$);
        await settle();
        expect(late.values).toEqual([]);
        fills.unsubscribe();
        late.unsubscribe();
        placed.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a failing order errors the result; fills$ hears nothing", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.ordersBlotter;
        const fills = collect(p.fills$);
        await settle();
        const placed = collect(p.place(REQUEST));
        await settle();
        h.driver.failOrder(new Error("bust"));
        await settle();
        expect(placed.errors).toHaveLength(1);
        expect(placed.values).toEqual([]);
        expect(fills.values).toEqual([]);
        fills.unsubscribe();
        placed.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("orders$ stays warm across zero subscribers: a lifecycle update still refreshes it, and a fresh subscriber replays the latest book synchronously", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.ordersBlotter;
        const first = collect(p.orders$);
        await settle();
        first.unsubscribe();
        await settle();
        const placed = collect(p.place(REQUEST));
        await settle();
        const filled = createEquityOrder({ status: "filled", filledQty: 100 });
        h.driver.setOrderBook([filled]);
        h.driver.emitOrderUpdate(filled);
        await settle();
        const again = collect(p.orders$);
        expect(again.values).toEqual([[filled]]);
        again.unsubscribe();
        placed.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
