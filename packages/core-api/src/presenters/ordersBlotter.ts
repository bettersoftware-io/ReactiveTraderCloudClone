import type { EquityOrder, PlaceOrderRequest } from "@rtc/domain";

import type { Stream } from "#/stream";

/** Minimal fill-signal emitted on `OrdersBlotterPresenter.fills$` — one per filled order. */
export interface EquityFillSignal {
  readonly symbol: string;
}

export interface OrdersBlotterPresenter {
  /** Emits { symbol } for each equity order that reaches "filled" status. */
  readonly fills$: Stream<EquityFillSignal>;
  readonly orders$: Stream<readonly EquityOrder[]>;
  place(req: PlaceOrderRequest): Stream<EquityOrder>;
}
