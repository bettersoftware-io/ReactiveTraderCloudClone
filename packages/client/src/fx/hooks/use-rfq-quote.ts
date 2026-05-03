import { useCallback } from "react";
import type { CurrencyPair } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";
import type { UseRfqStateResult, RfqQuote } from "./use-rfq-state";

const RFQ_TIMEOUT_MS = 10_000;

export function useRfqQuote(
  pair: CurrencyPair,
  rfqState: UseRfqStateResult,
) {
  const { pricing } = useServices();

  const requestQuote = useCallback(async () => {
    rfqState.initiate();

    // Use getRfqQuote if available on mock engine, otherwise simulate
    const pricingEngine = pricing as { getRfqQuote?: (symbol: string, pipsPosition: number) => { bid: number; ask: number; mid: number } };

    // Small delay to simulate network
    await new Promise<void>((r) => setTimeout(r, 500 + Math.random() * 1500));

    if (pricingEngine.getRfqQuote) {
      const result = pricingEngine.getRfqQuote(pair.symbol, pair.pipsPosition);
      const quote: RfqQuote = {
        bid: result.bid,
        ask: result.ask,
        timeoutMs: RFQ_TIMEOUT_MS,
      };
      rfqState.receiveQuote(quote);
    } else {
      // Fallback: get current price from history
      const history = await pricing.getPriceHistory(pair.symbol);
      if (history.length > 0) {
        const last = history[history.length - 1];
        const quote: RfqQuote = {
          bid: last.bid,
          ask: last.ask,
          timeoutMs: RFQ_TIMEOUT_MS,
        };
        rfqState.receiveQuote(quote);
      }
    }
  }, [pricing, pair, rfqState]);

  return requestQuote;
}
