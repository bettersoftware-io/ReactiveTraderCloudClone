import { type Observable, shareReplay } from "rxjs";

import type { EquityOrder, OrderPort, PlaceOrderRequest } from "@rtc/domain";

export class OrdersBlotterPresenter {
  readonly orders$: Observable<readonly EquityOrder[]>;

  constructor(private readonly orderPort: OrderPort) {
    this.orders$ = this.orderPort
      .orders()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  place(req: PlaceOrderRequest): Observable<EquityOrder> {
    return this.orderPort.place(req);
  }
}
