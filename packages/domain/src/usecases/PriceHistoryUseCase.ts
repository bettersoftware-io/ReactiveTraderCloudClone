import type { PricingPort } from "../ports/pricingPort.js";
import type { PriceTick } from "../fx/price.js";
import { PRICE_HISTORY_SIZE } from "../fx/price.js";

export class PriceHistoryUseCase {
  constructor(private readonly pricing: PricingPort) {}

  async *execute(symbol: string): AsyncIterable<readonly PriceTick[]> {
    const buffer: PriceTick[] = [];
    for await (const tick of this.pricing.getPriceUpdates(symbol)) {
      buffer.push(tick);
      if (buffer.length > PRICE_HISTORY_SIZE) buffer.shift();
      yield [...buffer];
    }
  }
}
