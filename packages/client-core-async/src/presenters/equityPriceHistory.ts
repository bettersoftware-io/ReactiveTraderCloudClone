import type { EquityPriceHistoryPresenter, Stream } from "@rtc/core-api";
import {
  EquityPriceHistoryUseCase,
  type EquityQuote,
  type MarketDataPort,
  PRICE_HISTORY_CONFLATION_MS,
} from "@rtc/domain";

import { topicToStreamWithLead } from "#/bridge/out";
import { createConflatedTopic } from "#/presenters/conflatedTopic";

/** The equities twin of `createPriceHistoryPresenter` — same design (see
 * that file): the window array is owned here and outlives any subscription,
 * the Topic releases the port on the last unsubscribe, and a remount
 * repaints the retained window through the stream's `lead`. A never-mounted
 * symbol has an empty window and no lead. */
export function createEquityPriceHistoryPresenter(
  marketData: MarketDataPort,
  isCalm$: Stream<boolean>,
): EquityPriceHistoryPresenter {
  const useCase = new EquityPriceHistoryUseCase(marketData);
  const cache = new Map<string, Stream<readonly EquityQuote[]>>();

  return {
    history$: (symbol: string) => {
      const cached = cache.get(symbol);

      if (cached !== undefined) {
        return cached;
      }

      const retained: EquityQuote[] = [];
      const stream = topicToStreamWithLead(
        createConflatedTopic(
          useCase.execute(symbol, retained),
          isCalm$,
          PRICE_HISTORY_CONFLATION_MS,
        ),
        () => {
          return retained.length === 0 ? null : { value: [...retained] };
        },
      );
      cache.set(symbol, stream);
      return stream;
    },
  };
}
