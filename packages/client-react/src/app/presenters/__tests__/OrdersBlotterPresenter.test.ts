import { concat, map, of, timer } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EquityOrder, OrderPort, PlaceOrderRequest } from "@rtc/domain";

import {
  type EquityFillSignal,
  OrdersBlotterPresenter,
} from "../OrdersBlotterPresenter";

afterEach(() => {
  vi.useRealTimers();
});

describe("OrdersBlotterPresenter — fills$", () => {
  it("nexts fills$ with { symbol } when place() reaches 'filled' status", async () => {
    vi.useFakeTimers();

    const fillOrder = makeFakeOrder({
      status: "filled",
      filledQty: 100,
      avgPrice: 190,
    });

    const fakePort: OrderPort = {
      orders: () => {
        return of([]);
      },
      place: (_req: PlaceOrderRequest) => {
        return concat(
          of(makeFakeOrder({ status: "new" })),
          timer(300).pipe(
            map(() => {
              return makeFakeOrder({ status: "working" });
            }),
          ),
          timer(500).pipe(
            map(() => {
              return fillOrder;
            }),
          ),
        );
      },
      cancel: (_orderId: string) => {
        return of(undefined);
      },
    };

    const presenter = new OrdersBlotterPresenter(fakePort);

    const fillsSeen: EquityFillSignal[] = [];
    const sub = presenter.fills$.subscribe((f) => {
      fillsSeen.push(f);
    });

    const placeReq: PlaceOrderRequest = {
      symbol: "AAPL",
      side: "buy",
      type: "market",
      qty: 100,
    };

    const placeSub = presenter.place(placeReq).subscribe();

    await vi.advanceTimersByTimeAsync(1000);
    placeSub.unsubscribe();
    sub.unsubscribe();

    expect(fillsSeen).toEqual([{ symbol: "AAPL" }]);
  });

  it("does NOT next fills$ for intermediate statuses (new, working)", async () => {
    vi.useFakeTimers();

    const fakePort: OrderPort = {
      orders: () => {
        return of([]);
      },
      place: (_req: PlaceOrderRequest) => {
        return concat(
          of(makeFakeOrder({ status: "new" })),
          timer(300).pipe(
            map(() => {
              return makeFakeOrder({ status: "working" });
            }),
          ),
        );
      },
      cancel: (_orderId: string) => {
        return of(undefined);
      },
    };

    const presenter = new OrdersBlotterPresenter(fakePort);

    const fillsSeen: EquityFillSignal[] = [];
    const sub = presenter.fills$.subscribe((f) => {
      fillsSeen.push(f);
    });

    const placeSub = presenter
      .place({
        symbol: "AAPL",
        side: "buy",
        type: "market",
        qty: 100,
      })
      .subscribe();

    await vi.advanceTimersByTimeAsync(500);
    placeSub.unsubscribe();
    sub.unsubscribe();

    expect(fillsSeen).toHaveLength(0);
  });
});

function makeFakeOrder(overrides: Partial<EquityOrder> = {}): EquityOrder {
  return {
    id: "eq-1",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 100,
    status: "new",
    filledQty: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}
