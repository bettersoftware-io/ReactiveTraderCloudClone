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

  /**
   * Per-symbol accumulation windows, owned by this presenter (a
   * composition-root singleton) so they outlive any single subscription.
   *
   * The stream itself stays `refCount: true`, so the underlying per-symbol
   * pricing subscription still releases when the last tile unmounts (e.g. a
   * pair filtered out of LiveRates) — as per-symbol streams must. But the
   * window array persists here, so when the tile remounts the fold picks up
   * the accumulated history instead of restarting from an empty buffer, which
   * would blank the sparkline. Bounded by the fixed currency-pair roster; each
   * window is itself capped at PRICE_HISTORY_SIZE inside the use case. This is
   * deliberately NOT warmReplay: that would hold the pricing subscription open
   * for the whole session, which warmReplay explicitly forbids for per-symbol
   * streams.
   */
  private readonly windows = new Map<string, PriceTick[]>();

  constructor(
    private readonly pricing: PricingPort,
    private readonly powerSaver$: Observable<boolean>,
  ) {}

  history$(symbol: string): Observable<readonly PriceTick[]> {
    const cached = this.cache.get(symbol);

    if (cached) {
      return cached;
    }

    let window = this.windows.get(symbol);

    if (!window) {
      window = [];
      this.windows.set(symbol, window);
    }

    const raw = new PriceHistoryUseCase(this.pricing)
      .execute(symbol, window)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    const stream = raw.pipe(
      conflateWhen(this.powerSaver$, HISTORY_CONFLATION_MS),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.cache.set(symbol, stream);
    return stream;
  }
}
