import { type Observable, shareReplay } from "rxjs";

import {
  PriceHistoryUseCase,
  type PriceTick,
  type PricingPort,
} from "@rtc/domain";

import { conflateWhen } from "./conflateWhen";

/** Power-saver conflation interval for price history updates. */
const HISTORY_CONFLATION_MS = 1_000;

export class PriceHistoryPresenter {
  private readonly cache = new Map<string, Observable<readonly PriceTick[]>>();

  constructor(
    private readonly pricing: PricingPort,
    private readonly powerSaver$: Observable<boolean>,
  ) {}

  history$(symbol: string): Observable<readonly PriceTick[]> {
    const cached = this.cache.get(symbol);

    if (cached) {
      return cached;
    }

    const raw = new PriceHistoryUseCase(this.pricing)
      .execute(symbol)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));

    const stream = raw.pipe(
      conflateWhen(this.powerSaver$, HISTORY_CONFLATION_MS),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.cache.set(symbol, stream);
    return stream;
  }
}
