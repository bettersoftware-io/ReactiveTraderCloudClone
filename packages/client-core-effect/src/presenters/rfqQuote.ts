import { Effect, Stream } from "effect";

import type { RfqQuotePresenter } from "@rtc/core-api";
import { type PricingPort, RfqQuoteUseCase } from "@rtc/domain";

import { type EffectHost, streamToStream } from "#/bridge/out";
import { rpc } from "#/bridge/rpc";

/** One-shot FX RFQ quote: the port call is suspended until the returned
 * stream is subscribed; the result is emitted and the stream completes;
 * unsubscribing interrupts the fiber and with it the port subscription. */
export function createRfqQuotePresenter(
  host: EffectHost,
  pricing: PricingPort,
): RfqQuotePresenter {
  const useCase = new RfqQuoteUseCase(pricing);

  return {
    requestQuote: (symbol: string, pipsPosition: number) => {
      return streamToStream(
        host,
        Stream.fromEffect(
          Effect.suspend(() => {
            return rpc(useCase.execute(symbol, pipsPosition));
          }),
        ),
      );
    },
  };
}
