import { type Observable, Subject, startWith, switchMap, tap } from "rxjs";

import type {
  EquityFillSignal,
  OrdersBlotterPresenter as OrdersBlotterPresenterApi,
} from "@rtc/core-api";
import type { EquityOrder, OrderPort, PlaceOrderRequest } from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 4) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { EquityFillSignal };

export class OrdersBlotterPresenter implements OrdersBlotterPresenterApi {
  private readonly fillsSubject = new Subject<EquityFillSignal>();

  /** Triggers a fresh orders$ snapshot — nexted on every lifecycle emission
   * from place() (new/working/partiallyFilled/filled), since OrderPort.orders()
   * is a one-shot snapshot query (defer→of→complete), not a push stream: it
   * never emits again on its own once subscribed. Without this, a mounted
   * blotter would show whatever snapshot existed at mount forever, never
   * observing an order's own lifecycle transitions. */
  private readonly refresh = new Subject<void>();

  /** Emits { symbol } for each equity order that reaches "filled" status. */
  readonly fills$: Observable<EquityFillSignal> =
    this.fillsSubject.asObservable();

  readonly orders$: Observable<readonly EquityOrder[]>;

  constructor(private readonly orderPort: OrderPort) {
    // Singleton (one order book per connection) → warm across tab remounts.
    this.orders$ = this.refresh.pipe(
      startWith(undefined),
      switchMap(() => {
        return this.orderPort.orders();
      }),
      warmReplay(),
    );
  }

  place(req: PlaceOrderRequest): Observable<EquityOrder> {
    return this.orderPort.place(req).pipe(
      tap((order) => {
        this.refresh.next();

        if (order.status === "filled") {
          this.fillsSubject.next({ symbol: order.symbol });
        }
      }),
    );
  }
}
