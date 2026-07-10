import { type Observable, shareReplay } from "rxjs";

import {
  PriceHistoryUseCase,
  type PriceTick,
  type PricingPort,
} from "@rtc/domain";

export class PriceHistoryPresenter {
  private readonly cache = new Map<string, Observable<readonly PriceTick[]>>();

  constructor(private readonly pricing: PricingPort) {}

  history$(symbol: string): Observable<readonly PriceTick[]> {
    const cached = this.cache.get(symbol);

    if (cached) {
      return cached;
    }

    const stream = new PriceHistoryUseCase(this.pricing)
      .execute(symbol)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.cache.set(symbol, stream);
    return stream;
  }
}
