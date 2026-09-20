import { Option } from "effect";

import type { PriceHistoryPresenter, Stream } from "@rtc/core-api";
import {
  PRICE_HISTORY_CONFLATION_MS,
  PriceHistoryUseCase,
  type PriceTick,
  type PricingPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { conflatedFold } from "#/presenters/conflatedFold";

/** Per-symbol rolling tick windows, memoised per symbol. The window array
 * outlives every warm period — the presenter owns it, the use case appends
 * to it and caps it — while the PORT does not: the conflated fold releases
 * the pricing subscription on the last unsubscribe, as a per-symbol stream
 * must. The retained window IS the next period's seed, so a remounted tile
 * repaints its accumulated sparkline synchronously instead of waiting for
 * the next tick (the RxJS presenter's outermost `startWith`); a
 * never-mounted symbol has an empty window and so seeds `None`, keeping
 * cold semantics. */
export function createPriceHistoryPresenter(
  host: EffectHost,
  pricing: PricingPort,
  isCalm$: Stream<boolean>,
): PriceHistoryPresenter {
  const useCase = new PriceHistoryUseCase(pricing);
  const cache = new Map<string, Stream<readonly PriceTick[]>>();
  const windows = new Map<string, PriceTick[]>();

  return {
    history$: (symbol: string) => {
      const cached = cache.get(symbol);

      if (cached !== undefined) {
        return cached;
      }

      const retained = windows.get(symbol) ?? [];
      windows.set(symbol, retained);
      const stream = conflatedFold(
        host,
        useCase.execute(symbol, retained),
        isCalm$,
        PRICE_HISTORY_CONFLATION_MS,
        () => {
          return retained.length === 0
            ? Option.none<readonly PriceTick[]>()
            : Option.some<readonly PriceTick[]>([...retained]);
        },
      );
      cache.set(symbol, stream);
      return stream;
    },
  };
}
