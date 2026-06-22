import type { Observable } from "rxjs";

import type { PriceTick } from "../fx/price.js";

export interface RfqQuoteResult {
  readonly bid: number;
  readonly ask: number;
  readonly mid: number;
}

export interface PricingPort {
  getPriceUpdates(symbol: string): Observable<PriceTick>;
  getPriceHistory(symbol: string): Observable<readonly PriceTick[]>;
  getRfqQuote(symbol: string, pipsPosition: number): Observable<RfqQuoteResult>;
}
