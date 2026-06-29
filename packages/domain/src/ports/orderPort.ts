import type { Observable } from "rxjs";

import type { EquityOrder, OrderSide, OrderType } from "../equities/order.js";

export interface PlaceOrderRequest {
  readonly symbol: string;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly qty: number;
  readonly limitPrice?: number;
}

export interface OrderPort {
  /** Emits one EquityOrder per lifecycle update (new → working → partiallyFilled → filled). */
  place(req: PlaceOrderRequest): Observable<EquityOrder>;
  cancel(orderId: string): Observable<void>;
  orders(): Observable<readonly EquityOrder[]>;
}
