import type { PriceHistoryPresenter, Stream } from "@rtc/core-api";
import {
  PRICE_HISTORY_CONFLATION_MS,
  PriceHistoryUseCase,
  type PriceTick,
  type PricingPort,
} from "@rtc/domain";

import { topicToStreamWithLead } from "#/bridge/out";
import { createConflatedTopic } from "#/presenters/conflatedTopic";

/** Per-symbol rolling windows. The window ARRAY is owned here and outlives
 * any subscription: the use case pushes into it, the Topic releases the
 * port on the last unsubscribe (per-symbol streams must), and a remount
 * repaints the accumulated window synchronously through the stream's
 * `lead` before the topic's own values — the RxJS core's
 * `defer(() => shared.pipe(startWith(seed)))`. A never-mounted symbol has an
 * empty window and no lead. */
export function createPriceHistoryPresenter(
  pricing: PricingPort,
  isCalm$: Stream<boolean>,
): PriceHistoryPresenter {
  const useCase = new PriceHistoryUseCase(pricing);
  const cache = new Map<string, Stream<readonly PriceTick[]>>();

  return {
    history$: (symbol: string) => {
      const cached = cache.get(symbol);

      if (cached !== undefined) {
        return cached;
      }

      const retained: PriceTick[] = [];
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
