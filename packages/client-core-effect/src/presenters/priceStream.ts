import { Option } from "effect";

import type { PriceStreamPresenter, Stream } from "@rtc/core-api";
import {
  type CurrencyPair,
  PRICE_CONFLATION_MS,
  type Price,
  PriceStreamUseCase,
  type PricingPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { conflatedFold } from "#/presenters/conflatedFold";

/** Per-pair live prices, memoised per symbol. Each stream is a conflated
 * fold over the use case's `defer`red Observable: the port is subscribed
 * per warm period through `fromPort`, never here; every period starts
 * seedless (a price feed has no synchronous value) and silent until the
 * first tick. */
export function createPriceStreamPresenter(
  host: EffectHost,
  pricing: PricingPort,
  isCalm$: Stream<boolean>,
): PriceStreamPresenter {
  const useCase = new PriceStreamUseCase(pricing);
  const cache = new Map<string, Stream<Price>>();

  return {
    price$: (pair: CurrencyPair) => {
      const cached = cache.get(pair.symbol);

      if (cached !== undefined) {
        return cached;
      }

      const stream = conflatedFold(
        host,
        useCase.execute(pair),
        isCalm$,
        PRICE_CONFLATION_MS,
        () => {
          return Option.none<Price>();
        },
      );
      cache.set(pair.symbol, stream);
      return stream;
    },
  };
}
