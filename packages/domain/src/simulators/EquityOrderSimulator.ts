import { defer, Observable, of } from "rxjs";

import type { EquityOrder } from "../equities/order.js";
import type { OrderPort, PlaceOrderRequest } from "../ports/orderPort.js";

export interface FillEvent {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
}
export type OrderListener = (fill: FillEvent) => void;
export interface EquityOrderDeps {
  listener?: OrderListener;
  seed?: number;
  markFor?: (symbol: string) => number;
}

export class EquityOrderSimulator implements OrderPort {
  private readonly book: EquityOrder[] = [];

  private seq = 0;

  constructor(private readonly deps: EquityOrderDeps = {}) {}

  place(req: PlaceOrderRequest): Observable<EquityOrder> {
    return new Observable<EquityOrder>((subscriber) => {
      const id = `eq-${++this.seq}`;
      const createdAt = Date.now();
      const mark = this.deps.markFor?.(req.symbol) ?? req.limitPrice ?? 100;
      const fillPrice =
        req.type === "limit" && req.limitPrice !== undefined
          ? req.limitPrice
          : mark;
      const halfQty = Math.floor(req.qty / 2);

      function base(
        status: EquityOrder["status"],
        filledQty: number,
        avgPrice?: number,
      ): EquityOrder {
        return {
          id,
          symbol: req.symbol,
          side: req.side,
          type: req.type,
          qty: req.qty,
          limitPrice: req.limitPrice,
          status,
          filledQty,
          avgPrice,
          createdAt,
        };
      }

      let done = false;

      const emit = (
        status: EquityOrder["status"],
        filledQty: number,
        avgPrice?: number,
      ): void => {
        if (done) return;
        const order = base(status, filledQty, avgPrice);
        this.upsert(order);

        if (status === "filled") {
          this.deps.listener?.({
            symbol: req.symbol,
            side: req.side,
            qty: req.qty,
            price: fillPrice,
          });
        }

        subscriber.next(order);
      };

      // "new" emits synchronously; subsequent stages via queueMicrotask (not
      // faked by vi.useFakeTimers) so they complete within the microtask
      // queue drain on the first awaited promise in the test driver.
      emit("new", 0);
      queueMicrotask(() => {
        emit("working", 0);
        queueMicrotask(() => {
          emit("partiallyFilled", halfQty, fillPrice);
          queueMicrotask(() => {
            emit("filled", req.qty, fillPrice);

            if (!done) {
              done = true;
              subscriber.complete();
            }
          });
        });
      });

      return (): void => {
        done = true;
      };
    });
  }

  private upsert(order: EquityOrder): void {
    const i = this.book.findIndex((o) => {return o.id === order.id});

    if (i >= 0) {
      this.book[i] = order;
    } else {
      this.book.push(order);
    }
  }

  cancel(orderId: string): Observable<void> {
    const i = this.book.findIndex((o) => {return o.id === orderId});

    if (i >= 0 && this.book[i] !== undefined) {
      this.book[i] = { ...this.book[i], status: "cancelled" };
    }

    return of(undefined);
  }

  /** Emits the current order book snapshot and completes. */
  orders(): Observable<readonly EquityOrder[]> {
    return defer(() => {return of([...this.book] as const)});
  }
}
