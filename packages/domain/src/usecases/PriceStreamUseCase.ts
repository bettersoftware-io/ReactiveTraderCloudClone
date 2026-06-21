import { defer, type Observable } from "rxjs";
import { map } from "rxjs/operators";
import type { CurrencyPair } from "../fx/currencyPair.js";
import type { Price } from "../fx/price.js";
import { calculateSpread, detectMovement } from "../fx/price.js";
import type { PricingPort } from "../ports/pricingPort.js";

export class PriceStreamUseCase {
  constructor(private readonly pricing: PricingPort) {}

  execute(pair: CurrencyPair): Observable<Price> {
    return defer(() => {
      let previousMid: number | undefined;
      return this.pricing.getPriceUpdates(pair.symbol).pipe(
        map((tick) => {
          const enriched: Price = {
            ...tick,
            movementType: detectMovement(tick.mid, previousMid),
            spread: calculateSpread(
              tick.bid,
              tick.ask,
              pair.pipsPosition,
              pair.ratePrecision,
            ),
          };
          previousMid = tick.mid;
          return enriched;
        }),
      );
    });
  }
}
