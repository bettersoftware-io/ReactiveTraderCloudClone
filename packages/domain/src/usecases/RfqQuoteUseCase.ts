import type { Observable } from "rxjs";

import type { PricingPort, RfqQuoteResult } from "../ports/pricingPort.js";

export class RfqQuoteUseCase {
  constructor(private readonly pricing: PricingPort) {}
  execute(symbol: string, pipsPosition: number): Observable<RfqQuoteResult> {
    return this.pricing.getRfqQuote(symbol, pipsPosition);
  }
}
