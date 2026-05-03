import type { PricingPort } from "../ports/pricingPort.js";
import type { CurrencyPair } from "../fx/currency-pair.js";
import type { Price } from "../fx/price.js";
import { calculateSpread, detectMovement } from "../fx/price.js";

export class PriceStreamUseCase {
  constructor(private readonly pricing: PricingPort) {}

  async *execute(pair: CurrencyPair): AsyncIterable<Price> {
    let previousMid: number | undefined = undefined;
    for await (const tick of this.pricing.getPriceUpdates(pair.symbol)) {
      const enriched: Price = {
        ...tick,
        movementType: detectMovement(tick.mid, previousMid),
        spread: calculateSpread(tick.bid, tick.ask, pair.pipsPosition, pair.ratePrecision),
      };
      previousMid = tick.mid;
      yield enriched;
    }
  }
}
