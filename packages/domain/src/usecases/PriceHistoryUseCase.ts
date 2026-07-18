import { defer, type Observable } from "rxjs";
import { map } from "rxjs/operators";

import type { PriceTick } from "../fx/price.js";
import { PRICE_HISTORY_SIZE } from "../fx/price.js";
import type { PricingPort } from "../ports/pricingPort.js";

export class PriceHistoryUseCase {
  constructor(private readonly pricing: PricingPort) {}

  /**
   * Folds live ticks into a capped rolling window.
   *
   * `window` is the mutable accumulation buffer. It defaults to a fresh array,
   * giving the usual cold semantics (each subscription starts empty). Callers
   * that need the window to SURVIVE a resubscription — e.g. a LiveRates tile
   * that unmounts on a filter toggle and later remounts — pass in a persistent
   * array they own; the fold then continues appending to it instead of
   * restarting from zero. The cap (drop-oldest at `PRICE_HISTORY_SIZE`) is
   * applied here regardless, so a supplied window can never grow unbounded.
   */
  execute(
    symbol: string,
    window: PriceTick[] = [],
  ): Observable<readonly PriceTick[]> {
    return defer(() => {
      return this.pricing.getPriceUpdates(symbol).pipe(
        map((tick) => {
          window.push(tick);

          if (window.length > PRICE_HISTORY_SIZE) {
            window.shift();
          }

          return [...window];
        }),
      );
    });
  }
}
