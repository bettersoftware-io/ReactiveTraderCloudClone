import type { Observable } from "rxjs";

import {
  type PricingPort,
  type RfqQuoteResult,
  RfqQuoteUseCase,
} from "@rtc/domain";

export class RfqQuotePresenter {
  private readonly useCase: RfqQuoteUseCase;

  constructor(pricing: PricingPort) {
    this.useCase = new RfqQuoteUseCase(pricing);
  }

  requestQuote(
    symbol: string,
    pipsPosition: number,
  ): Observable<RfqQuoteResult> {
    return this.useCase.execute(symbol, pipsPosition);
  }
}
