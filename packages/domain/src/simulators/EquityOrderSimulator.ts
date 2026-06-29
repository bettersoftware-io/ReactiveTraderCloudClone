import { concat, defer, map, Observable, of, timer } from "rxjs";

import type { EquityOrder } from "../equities/order.js";
import type { OrderPort, PlaceOrderRequest } from "../ports/orderPort.js";

const ACK_MS = 300;
const PARTIAL_MS = 800;
const FILL_MS = 1500;

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

    const lifecycle$ = concat(
      of(base("new", 0)),
      timer(ACK_MS).pipe(
        map(() => {
          return base("working", 0);
        }),
      ),
      timer(PARTIAL_MS - ACK_MS).pipe(
        map(() => {
          return base("partiallyFilled", halfQty, fillPrice);
        }),
      ),
      timer(FILL_MS - PARTIAL_MS).pipe(
        map(() => {
          return base("filled", req.qty, fillPrice);
        }),
      ),
    );

    return new Observable<EquityOrder>((subscriber) => {
      const sub = lifecycle$.subscribe({
        next: (order: EquityOrder) => {
          this.upsert(order);

          if (order.status === "filled") {
            this.deps.listener?.({
              symbol: req.symbol,
              side: req.side,
              qty: req.qty,
              price: fillPrice,
            });
          }

          subscriber.next(order);
        },
        complete: () => {
          return subscriber.complete();
        },
        error: (e: unknown) => {
          return subscriber.error(e);
        },
      });

      return (): void => {
        sub.unsubscribe();
      };
    });
  }

  private upsert(order: EquityOrder): void {
    const i = this.book.findIndex((o) => {
      return o.id === order.id;
    });

    if (i >= 0) {
      this.book[i] = order;
    } else {
      this.book.push(order);
    }
  }

  cancel(orderId: string): Observable<void> {
    const i = this.book.findIndex((o) => {
      return o.id === orderId;
    });

    if (i >= 0 && this.book[i] !== undefined) {
      this.book[i] = { ...this.book[i], status: "cancelled" };
    }

    return of(undefined);
  }

  /** Emits the current order book snapshot and completes. */
  orders(): Observable<readonly EquityOrder[]> {
    return defer(() => {
      return of([...this.book] as const);
    });
  }
}
