import type { Observable } from "rxjs";
import {
  RfqQuoteUseCase, type PricingPort, type RfqQuoteResult,
} from "@rtc/domain";

export class RfqQuotePresenter {
  private readonly useCase: RfqQuoteUseCase;
  constructor(pricing: PricingPort) {
    this.useCase = new RfqQuoteUseCase(pricing);
  }
  requestQuote(symbol: string, pipsPosition: number): Observable<RfqQuoteResult> {
    return this.useCase.execute(symbol, pipsPosition);
  }
}
