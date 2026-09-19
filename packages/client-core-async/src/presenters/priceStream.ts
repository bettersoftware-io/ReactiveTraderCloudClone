import type { PriceStreamPresenter, Stream } from "@rtc/core-api";
import {
  type CurrencyPair,
  PRICE_CONFLATION_MS,
  type Price,
  PriceStreamUseCase,
  type PricingPort,
} from "@rtc/domain";

import { topicToStream } from "#/bridge/out";
import { createConflatedTopic } from "#/presenters/conflatedTopic";

/** Per-pair live prices, memoised per symbol so `price$(EURUSD) ===
 * price$(EURUSD)`. Each stream is one conflated Topic over the domain use
 * case's Observable: `execute(pair)` is a `defer`, so the PORT is subscribed
 * per warm period (the RxJS core's shape — enrichment state restarts with
 * the period) and never here. `isCalm$` gates the conflation. */
export function createPriceStreamPresenter(
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

      const stream = topicToStream(
        createConflatedTopic(
          useCase.execute(pair),
          isCalm$,
          PRICE_CONFLATION_MS,
        ),
      );
      cache.set(pair.symbol, stream);
      return stream;
    },
  };
}
