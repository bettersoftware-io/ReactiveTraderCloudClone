import { Option } from "effect";

import type { EquityPriceHistoryPresenter, Stream } from "@rtc/core-api";
import {
  EquityPriceHistoryUseCase,
  type EquityQuote,
  type MarketDataPort,
  PRICE_HISTORY_CONFLATION_MS,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { conflatedFold } from "#/presenters/conflatedFold";

/** The equities twin of `createPriceHistoryPresenter` — same design (see
 * that file): the window array outlives every warm period while the port
 * does not, and the retained window is the next period's seed, so a
 * remounted row repaints synchronously; a never-mounted symbol seeds `None`. */
export function createEquityPriceHistoryPresenter(
  host: EffectHost,
  marketData: MarketDataPort,
  isCalm$: Stream<boolean>,
): EquityPriceHistoryPresenter {
  const useCase = new EquityPriceHistoryUseCase(marketData);
  const cache = new Map<string, Stream<readonly EquityQuote[]>>();
  const windows = new Map<string, EquityQuote[]>();

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
            ? Option.none<readonly EquityQuote[]>()
            : Option.some<readonly EquityQuote[]>([...retained]);
        },
      );
      cache.set(symbol, stream);
      return stream;
    },
  };
}
