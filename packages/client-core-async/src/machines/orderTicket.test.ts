import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { OrderTicketState } from "@rtc/core-api";
import type { EquityOrder, PlaceOrderRequest } from "@rtc/domain";

import { createOrderTicketMachine } from "#/machines/orderTicket";

describe("createOrderTicketMachine", () => {
  it("a failing place() is reported out of band and the state stays submitting", async () => {
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
      expect(() => {
        vi.runAllTimers();
      }).toThrow("bust");
      expect(seen.at(-1)).toEqual({ phase: "submitting" });
      machine.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a superseded run's late update is ignored", async () => {
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

    machine.intents.setQty(2);
    machine.intents.submit();
    await flushMicrotasks();
    expect(requests).toHaveLength(2);

    // The FIRST run's stream is superseded but not itself unsubscribed by
    // the test double — a late update from it must not reach the ticket.
    firstOrders.next(createOrder({ id: "stale" }));
    await flushMicrotasks();
    expect(seen.at(-1)).toEqual({ phase: "submitting" });

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
