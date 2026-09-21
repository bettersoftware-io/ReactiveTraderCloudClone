import { Subject, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import type { EquityOrder, OrderPort, PlaceOrderRequest } from "@rtc/domain";

import { createOrdersBlotterPresenter } from "#/presenters/ordersBlotter";

describe("createOrdersBlotterPresenter", () => {
  it("a failing orders() query fails orders$'s subscribers", async () => {
    const orders: OrderPort = {
      place: () => {
        return new Subject<EquityOrder>();
      },
      cancel: () => {
        return new Subject<void>();
      },
      orders: () => {
        return throwError(() => {
          return new Error("bust");
        });
      },
    };

    const presenter = createOrdersBlotterPresenter(
      orders,
      new AbortController().signal,
    );
    const errors: unknown[] = [];
    presenter.orders$.subscribe({
      error: (e: unknown) => {
        errors.push(e);
      },
    });
    await settle();
    expect(errors).toHaveLength(1);
  });

  it("a refresh arriving while a query is pending aborts it", async () => {
    const queries: Subject<readonly EquityOrder[]>[] = [];
    const placed = new Subject<EquityOrder>();
    const orders: OrderPort = {
      place: () => {
        return placed;
      },
      cancel: () => {
        return new Subject<void>();
      },
      orders: () => {
        const source = new Subject<readonly EquityOrder[]>();
        queries.push(source);
        return source;
      },
    };

    const presenter = createOrdersBlotterPresenter(
      orders,
      new AbortController().signal,
    );
    presenter.orders$.subscribe(() => {});
    await settle();
    expect(queries).toHaveLength(1);
    expect(queries[0]?.observed).toBe(true);

    const placeSub = presenter.place(REQUEST).subscribe(() => {});
    await settle();
    placed.next(createOrder({ status: "working" }));
    await settle();

    // The refresh triggered by the lifecycle update supersedes the first
    // query: it is released, and a second query is now live.
    expect(queries).toHaveLength(2);
    expect(queries[0]?.observed).toBe(false);
    expect(queries[1]?.observed).toBe(true);
    placeSub.unsubscribe();
  });

  it("lifetime.abort() ends the book's run", async () => {
    const query = new Subject<readonly EquityOrder[]>();
    const orders: OrderPort = {
      place: () => {
        return new Subject<EquityOrder>();
      },
      cancel: () => {
        return new Subject<void>();
      },
      orders: () => {
        return query;
      },
    };
    const lifetime = new AbortController();
    const presenter = createOrdersBlotterPresenter(orders, lifetime.signal);
    presenter.orders$.subscribe(() => {}).unsubscribe();
    await settle();
    expect(query.observed).toBe(true);
    lifetime.abort();
    expect(query.observed).toBe(false);
  });

  it("place() is lazy and two calls open two port calls", () => {
    let opens = 0;
    const orders: OrderPort = {
      place: () => {
        opens += 1;
        return new Subject<EquityOrder>();
      },
      cancel: () => {
        return new Subject<void>();
      },
      orders: () => {
        return new Subject<readonly EquityOrder[]>();
      },
    };

    const presenter = createOrdersBlotterPresenter(
      orders,
      new AbortController().signal,
    );
    const first = presenter.place(REQUEST);
    const second = presenter.place(REQUEST);
    expect(opens).toBe(0);
    const sub1 = first.subscribe(() => {});
    const sub2 = second.subscribe(() => {});
    expect(opens).toBe(2);
    sub1.unsubscribe();
    sub2.unsubscribe();
  });

  function createOrder(overrides: Partial<EquityOrder> = {}): EquityOrder {
    return {
      id: "ord-1",
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

  async function settle(): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
});

const REQUEST: PlaceOrderRequest = {
  symbol: "AAPL",
  side: "buy",
  type: "limit",
  qty: 100,
  limitPrice: 190,
};
