import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { OrderTicketState } from "@rtc/core-api";
import type { EquityOrder, PlaceOrderRequest } from "@rtc/domain";

import { createOrderTicketMachine } from "#/machines/orderTicket";

describe("createOrderTicketMachine", () => {
  it("a failing place() lands on rejected and reports nothing out of band", async () => {
    vi.useFakeTimers();

    try {
      const orders = new Subject<EquityOrder>();
      const machine = createOrderTicketMachine({
        place: () => {
          return orders;
        },
        defaultSymbol: "AAPL",
      });
      const seen: OrderTicketState[] = [];
      machine.state$.subscribe((v: OrderTicketState) => {
        seen.push(v);
      });
      machine.intents.setQty(1);
      machine.intents.submit();
      await flushMicrotasks();
      expect(seen.at(-1)).toEqual({ phase: "submitting" });

      orders.error(new Error("bust"));
      await flushMicrotasks();
      // Caught inside the run: the slot has nothing to rethrow on a
      // macrotask, which is where the old "stays submitting" reported it.
      expect(() => {
        vi.runAllTimers();
      }).not.toThrow();
      expect(seen.at(-1)).toEqual({ phase: "rejected", reason: "bust" });
      machine.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  // A superseding submit WITHDRAWS the run in flight: `slot.start` aborts
  // the run's signal, and `relay` observes that SYNCHRONOUSLY —
  // unsubscribing `firstOrders` before the second `place()` call is even
  // made. `firstOrders.observed === false` is the actual witness of that
  // withdrawal; a late `firstOrders.next(...)` reaching nobody would prove
  // nothing more (relay's own unsubscribe already means nothing is
  // listening, regardless of `run.ifCurrent`'s guard). `run.ifCurrent`
  // around `offer` is still real — it defends `set`/`ifCurrent` against a
  // callback that resolves in the SAME tick a superseding `start()` runs, a
  // race that has nothing to do with `relay`'s subscription lifecycle and is
  // exercised directly against the slot in `kernel/runSlot.test.ts`
  // ("closes the post-await stale-write window"); it happens to be moot for
  // THIS scenario because the relay's synchronous unsubscribe already closes
  // the window before the guard would ever be asked to.
  it("a superseding submit withdraws the first place() call; only the second's updates land", async () => {
    const firstOrders = new Subject<EquityOrder>();
    const secondOrders = new Subject<EquityOrder>();
    const requests: PlaceOrderRequest[] = [];
    const machine = createOrderTicketMachine({
      place: (req: PlaceOrderRequest) => {
        requests.push(req);
        return requests.length === 1 ? firstOrders : secondOrders;
      },
      defaultSymbol: "AAPL",
    });
    const seen: OrderTicketState[] = [];
    machine.state$.subscribe((v: OrderTicketState) => {
      seen.push(v);
    });
    machine.intents.setQty(1);
    machine.intents.submit();
    await flushMicrotasks();
    expect(firstOrders.observed).toBe(true);

    machine.intents.setQty(2);
    machine.intents.submit();
    await flushMicrotasks();
    expect(requests).toHaveLength(2);
    expect(firstOrders.observed).toBe(false);

    secondOrders.next(createOrder({ id: "live", status: "filled" }));
    await flushMicrotasks();
    expect(seen.at(-1)).toEqual({
      phase: "filled",
      order: createOrder({ id: "live", status: "filled" }),
    });
    machine.dispose();
  });

  it("a plain form edit after dispose() is ignored — patch()'s own isDisposed guard", () => {
    const machine = createOrderTicketMachine({
      place: () => {
        return new Subject<EquityOrder>();
      },
      defaultSymbol: "AAPL",
    });
    const seen: OrderTicketState[] = [];
    machine.state$.subscribe((v: OrderTicketState) => {
      seen.push(v);
    });
    machine.dispose();

    machine.intents.setQty(5);
    expect(seen.at(-1)).toMatchObject({ form: { qty: 0 } });
  });

  function createOrder(overrides: Partial<EquityOrder> = {}): EquityOrder {
    return {
      id: "ord-1",
      symbol: "AAPL",
      side: "buy",
      type: "market",
      qty: 1,
      status: "working",
      filledQty: 0,
      createdAt: 0,
      ...overrides,
    };
  }

  async function flushMicrotasks(): Promise<void> {
    for (let turn = 0; turn < 8; turn += 1) {
      await Promise.resolve();
    }
  }
});
