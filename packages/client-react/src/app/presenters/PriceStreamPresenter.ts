import {
  type CurrencyPair,
  type Price,
  PriceStreamUseCase,
  type PricingPort,
} from "@rtc/domain";
import { type Observable, shareReplay } from "rxjs";

export class PriceStreamPresenter {
  private readonly cache = new Map<string, Observable<Price>>();
  constructor(private readonly pricing: PricingPort) {}

  price$(pair: CurrencyPair): Observable<Price> {
    const cached = this.cache.get(pair.symbol);
    if (cached) return cached;
    const stream = new PriceStreamUseCase(this.pricing)
      .execute(pair)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.cache.set(pair.symbol, stream);
    return stream;
  }
}
