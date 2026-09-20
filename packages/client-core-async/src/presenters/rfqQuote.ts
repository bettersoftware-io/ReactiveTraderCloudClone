import type { RfqQuotePresenter } from "@rtc/core-api";
import { type PricingPort, RfqQuoteUseCase } from "@rtc/domain";

import { once } from "#/bridge/in";
import { promiseToStream } from "#/bridge/out";

/** One-shot FX RFQ quote: the port is called only when the returned stream
 * is subscribed; the result is emitted and the stream completes;
 * unsubscribing releases the in-flight call (`once`'s signal). */
export function createRfqQuotePresenter(
  pricing: PricingPort,
): RfqQuotePresenter {
  const useCase = new RfqQuoteUseCase(pricing);

  return {
    requestQuote: (symbol: string, pipsPosition: number) => {
      return promiseToStream((signal) => {
        return once(useCase.execute(symbol, pipsPosition), signal);
      });
    },
  };
}
