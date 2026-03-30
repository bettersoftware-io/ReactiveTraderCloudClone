import type { PriceTick } from "../fx/price.js";

export interface PricingPort {
  getPriceUpdates(symbol: string): AsyncIterable<PriceTick>;
  getPriceHistory(symbol: string): Promise<readonly PriceTick[]>;
}
