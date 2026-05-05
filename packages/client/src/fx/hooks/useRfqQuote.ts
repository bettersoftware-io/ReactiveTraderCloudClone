import { useCallback } from "react";
import { firstValueFrom } from "rxjs";
import type { CurrencyPair } from "@rtc/domain";
import { useHooks } from "../../app/HooksProvider";
import type { UseRfqStateResult, RfqQuote } from "./useRfqState";

const RFQ_TIMEOUT_MS = 10_000;

export function useRfqQuote(
  pair: CurrencyPair,
  rfqState: UseRfqStateResult,
) {
  const requestQuote = useHooks().useRequestRfqQuote();

  return useCallback(async () => {
    rfqState.initiate();
    try {
      const result = await firstValueFrom(requestQuote(pair.symbol, pair.pipsPosition));
      const quote: RfqQuote = {
        bid: result.bid,
        ask: result.ask,
        timeoutMs: RFQ_TIMEOUT_MS,
      };
      rfqState.receiveQuote(quote);
    } catch {
      rfqState.reject();
    }
  }, [pair, requestQuote, rfqState]);
}
