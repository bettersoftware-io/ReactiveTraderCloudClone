import { type Observable, shareReplay } from "rxjs";

import {
  type CurrencyPair,
  type Price,
  PriceStreamUseCase,
  type PricingPort,
} from "@rtc/domain";

import { conflateWhen } from "./conflateWhen";

/** Power-saver conflation interval for live prices. */
const PRICE_CONFLATION_MS = 250;

export class PriceStreamPresenter {
  private readonly cache = new Map<string, Observable<Price>>();

  constructor(
    private readonly pricing: PricingPort,
    private readonly powerSaver$: Observable<boolean>,
  ) {}

  price$(pair: CurrencyPair): Observable<Price> {
    const cached = this.cache.get(pair.symbol);

    if (cached) {
      return cached;
    }

    const raw = new PriceStreamUseCase(this.pricing)
      .execute(pair)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));

    const stream = raw.pipe(
      conflateWhen(this.powerSaver$, PRICE_CONFLATION_MS),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.cache.set(pair.symbol, stream);
    return stream;
  }
}
