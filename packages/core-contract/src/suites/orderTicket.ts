import { describe, expect, it } from "vitest";

import type { OrderTicketForm, OrderTicketState } from "@rtc/core-api";

import { collect } from "#/harness/collect";
import { createEquityOrder } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

const DEFAULT_FORM: OrderTicketForm = {
  symbol: "AAPL",
  side: "buy",
  type: "market",
  qty: 0,
};

function phases(values: readonly OrderTicketState[]): string[] {
  return values.map((state) => {
    return state.phase;
  });
}

export function describeOrderTicketContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts editing the default form for its symbol; each setter patches the form", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        expect(c.values).toEqual([
          { phase: "editing", form: DEFAULT_FORM, error: null },
        ]);
        m.intents.setSymbol("MSFT");
        m.intents.setSide("sell");
        m.intents.setType("limit");
        m.intents.setQty(50);
        m.intents.setLimitPrice(410);
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "editing",
          form: {
            symbol: "MSFT",
            side: "sell",
            type: "limit",
            qty: 50,
            limitPrice: 410,
          },
          error: null,
        });
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("an invalid submit stays editing with the reason and places nothing; the next edit clears the reason", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.submit();
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          phase: "editing",
          error: "Quantity must be greater than zero",
        });
        m.intents.setQty(10);
        m.intents.setType("limit");
        m.intents.submit();
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          phase: "editing",
          error: "Limit price required for a limit order",
        });
        expect(h.driver.pendingOrders()).toEqual([]);
        m.intents.setLimitPrice(190);
        await settle();
        expect(c.values.at(-1)).toMatchObject({
          phase: "editing",
          error: null,
        });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a valid submit → submitting with the form as the request, then each lifecycle update as its phase", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setType("limit");
        m.intents.setQty(100);
        m.intents.setLimitPrice(190);
        m.intents.submit();
        await settle();
        expect(c.values.at(-1)).toEqual({ phase: "submitting" });
        expect(h.driver.pendingOrders()).toEqual([
          {
            symbol: "AAPL",
            side: "buy",
            type: "limit",
            qty: 100,
            limitPrice: 190,
          },
        ]);
        const working = createEquityOrder({ status: "working" });
        h.driver.emitOrderUpdate(working);
        await settle();
        expect(c.values.at(-1)).toEqual({ phase: "working", order: working });
        const partial = createEquityOrder({
          status: "partiallyFilled",
          filledQty: 40,
        });
        h.driver.emitOrderUpdate(partial);
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "partiallyFilled",
          order: partial,
        });
        const filled = createEquityOrder({ status: "filled", filledQty: 100 });
        h.driver.emitOrderUpdate(filled);
        await settle();
        expect(c.values.at(-1)).toEqual({ phase: "filled", order: filled });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a rejected order lands as rejected with its reason", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setQty(1);
        m.intents.submit();
        await settle();
        h.driver.emitOrderUpdate(createEquityOrder({ status: "rejected" }));
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "rejected",
          reason: "Order rejected",
        });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("while an order is in flight a form edit does not surface — but it is kept: the first edit after the fill shows both", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setQty(1);
        m.intents.submit();
        await settle();
        h.driver.emitOrderUpdate(createEquityOrder({ status: "working" }));
        await settle();
        m.intents.setQty(5);
        await settle();
        expect(c.values.at(-1)?.phase).toBe("working");
        h.driver.emitOrderUpdate(
          createEquityOrder({ status: "filled", filledQty: 1 }),
        );
        await settle();
        m.intents.setSide("sell");
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "editing",
          form: { ...DEFAULT_FORM, qty: 5, side: "sell" },
          error: null,
        });
        // An edit suppressed while in flight must never surface as a rejection.
        expect(phases(c.values)).not.toContain("rejected");
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("reset after a fill returns to editing the default form", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setQty(1);
        m.intents.submit();
        await settle();
        h.driver.emitOrderUpdate(
          createEquityOrder({ status: "filled", filledQty: 1 }),
        );
        await settle();
        m.intents.reset();
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "editing",
          form: DEFAULT_FORM,
          error: null,
        });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a second submit supersedes the order in flight: the first is withdrawn, the second's updates land", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setQty(1);
        m.intents.submit();
        await settle();
        h.driver.emitOrderUpdate(createEquityOrder({ status: "working" }));
        await settle();
        // Edited while in flight — the edit does not surface in state (that
        // is the prior case's contract), but it is what the second submit
        // sends: the first request (qty 1) is withdrawn, so the driver's
        // pending order is the second one, not a stale duplicate of the first.
        m.intents.setQty(2);
        m.intents.submit();
        await settle();
        expect(h.driver.pendingOrders()).toEqual([
          { symbol: "AAPL", side: "buy", type: "market", qty: 2 },
        ]);
        expect(c.values.at(-1)).toEqual({ phase: "submitting" });
        const filled = createEquityOrder({ id: "ord-2", status: "filled" });
        h.driver.emitOrderUpdate(filled);
        await settle();
        expect(c.values.at(-1)).toEqual({ phase: "filled", order: filled });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("an INVALID submit while an order is in flight withdraws it and shows the reason", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setQty(1);
        m.intents.submit();
        await settle();
        expect(h.driver.pendingOrders()).toHaveLength(1);
        m.intents.setQty(0);
        m.intents.submit();
        await settle();
        expect(h.driver.pendingOrders()).toEqual([]);
        expect(c.values.at(-1)).toMatchObject({
          phase: "editing",
          error: "Quantity must be greater than zero",
        });
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("dispose() after the last unsubscribe withdraws the order in flight; a later submit places nothing; a fresh subscription still yields a value synchronously", async () => {
      const h = makeHarness();
      const m = h.machines.orderTicket("AAPL");

      try {
        const c = collect(m.state$);
        m.intents.setQty(1);
        m.intents.submit();
        await settle();
        expect(h.driver.pendingOrders()).toHaveLength(1);
        c.unsubscribe();
        m.dispose();
        await settle();
        expect(h.driver.pendingOrders()).toEqual([]);
        m.intents.submit();
        await settle();
        expect(h.driver.pendingOrders()).toEqual([]);
        const fresh = collect(m.state$);
        // The post-dispose VALUE is uncontracted (slice 2) — a disposed RxJS
        // `state()` replays its default; only that a fresh subscriber is not
        // left silent is promised.
        expect(fresh.values).toHaveLength(1);
        fresh.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
