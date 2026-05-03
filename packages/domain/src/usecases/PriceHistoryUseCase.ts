import { type Observable, defer } from "rxjs";
import { map } from "rxjs/operators";
import type { PricingPort } from "../ports/pricingPort.js";
import type { PriceTick } from "../fx/price.js";
import { PRICE_HISTORY_SIZE } from "../fx/price.js";

export class PriceHistoryUseCase {
  constructor(private readonly pricing: PricingPort) {}

  execute(symbol: string): Observable<readonly PriceTick[]> {
    return defer(() => {
      const buffer: PriceTick[] = [];
      return this.pricing.getPriceUpdates(symbol).pipe(
        map((tick) => {
          buffer.push(tick);
          if (buffer.length > PRICE_HISTORY_SIZE) buffer.shift();
          return [...buffer];
        }),
      );
    });
  }
}
