import { type Observable, shareReplay } from "rxjs";

import type { DepthBook, MarketDataPort } from "@rtc/domain";

export class DepthPresenter {
  private readonly depthCache = new Map<string, Observable<DepthBook>>();

  constructor(private readonly marketData: MarketDataPort) {}

  depth$(symbol: string): Observable<DepthBook> {
    const cached = this.depthCache.get(symbol);

    if (cached) {
      return cached;
    }

    const stream = this.marketData
      .depth(symbol)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.depthCache.set(symbol, stream);
    return stream;
  }
}
