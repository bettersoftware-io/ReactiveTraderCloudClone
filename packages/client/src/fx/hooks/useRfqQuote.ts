import { useCallback } from "react";
import { firstValueFrom } from "rxjs";
import type { CurrencyPair } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";
import type { UseRfqStateResult, RfqQuote } from "./useRfqState";

const RFQ_TIMEOUT_MS = 10_000;

export function useRfqQuote(
  pair: CurrencyPair,
  rfqState: UseRfqStateResult,
) {
  const { pricing } = useServices();

  const requestQuote = useCallback(async () => {
    rfqState.initiate();

    // Small delay to simulate network
    await new Promise<void>((r) => setTimeout(r, 500 + Math.random() * 1500));

    const result = await firstValueFrom(
      pricing.getRfqQuote(pair.symbol, pair.pipsPosition),
    );
    const quote: RfqQuote = {
      bid: result.bid,
      ask: result.ask,
      timeoutMs: RFQ_TIMEOUT_MS,
    };
    rfqState.receiveQuote(quote);
  }, [pricing, pair, rfqState]);

  return requestQuote;
}
