import { type Observable, Subject, shareReplay, tap } from "rxjs";

import type { EquityOrder, OrderPort, PlaceOrderRequest } from "@rtc/domain";

/** Minimal fill-signal emitted on OrdersBlotterPresenter.fills$ — one per filled order. */
export interface EquityFillSignal {
  readonly symbol: string;
}

export class OrdersBlotterPresenter {
  private readonly fillsSubject = new Subject<EquityFillSignal>();

  /** Emits { symbol } for each equity order that reaches "filled" status. */
  readonly fills$: Observable<EquityFillSignal> =
    this.fillsSubject.asObservable();

  readonly orders$: Observable<readonly EquityOrder[]>;

  constructor(private readonly orderPort: OrderPort) {
    this.orders$ = this.orderPort
      .orders()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  place(req: PlaceOrderRequest): Observable<EquityOrder> {
    return this.orderPort.place(req).pipe(
      tap((order) => {
        if (order.status === "filled") {
          this.fillsSubject.next({ symbol: order.symbol });
        }
      }),
    );
  }
}
