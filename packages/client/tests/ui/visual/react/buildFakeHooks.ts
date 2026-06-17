import { EMPTY, type Observable } from "rxjs";
import {
  type CurrencyPair,
  type ExecuteTradeInput, type ExecuteTradeResult, type CreateRfqInput,
  type RfqQuoteResult, type QuoteRequest,
} from "@rtc/domain";
import type { AppHooks } from "../../../../src/ui/hooks/createAppHooks";
import type { AppData } from "../shared/appData";
import type { NotionalView } from "../../../../src/app/presenters/NotionalMachine";

const noop = (): void => {};

export function buildFakeHooks(data: AppData): AppHooks {
  return {
    usePrice: (pair: CurrencyPair) => data.prices[pair.symbol] ?? null,
    usePriceHistory: (symbol: string) => data.priceHistory[symbol] ?? [],
    useTrades: () => data.trades,
    useAnalytics: () => data.analytics,
    useRfqs: () => data.rfqs,
    useQuotesForRfq: (rfqId: number) => data.quotesForRfq[rfqId] ?? [],
    useAllQuotes: () => data.allQuotes,
    useCurrencyPairs: () => data.currencyPairs,
    useInstruments: () => data.instruments,
    useDealers: () => data.dealers,
    useConnectionStatus: () => data.connectionStatus,
    // Commands: no-op observables. Not exercised by static screenshots.
    useExecuteTrade: () => (_input: ExecuteTradeInput) =>
      EMPTY as Observable<ExecuteTradeResult>,
    useCreateRfq: () => (_input: CreateRfqInput) => EMPTY as Observable<number>,
    useAcceptQuote: () => (_quoteId: number) => EMPTY as Observable<void>,
    useCancelRfq: () => (_rfqId: number) => EMPTY as Observable<void>,
    usePassQuote: () => (_quoteId: number) => EMPTY as Observable<void>,
    useQuoteRfq: () => (_request: QuoteRequest) => EMPTY as Observable<void>,
    useRequestRfqQuote: () => (_symbol: string, _pipsPosition: number) =>
      EMPTY as Observable<RfqQuoteResult>,
    // Machine: static snapshot for screenshots; intents are no-ops.
    useTileExecution: () => ({
      state: data.tileExecution ?? { status: "ready" },
      execute: noop,
      dismiss: noop,
    }),
    useRfqTile: () => ({
      state: data.rfqTile ?? { status: "init", quote: null, remainingMs: 0 },
      requestQuote: noop,
      cancel: noop,
      reject: noop,
      accept: noop,
    }),
    // Intent-free derived flags: static snapshot for screenshots.
    useStaleFlag: (pair: CurrencyPair) => data.stale?.[pair.symbol] ?? false,
    useAnalyticsStaleFlag: () => data.analyticsStale ?? false,
    // Machine: static snapshot for screenshots; intents are no-ops.
    useNotional: (defaultNotional: number) => {
      const override = data.notional as NotionalView | undefined;
      const displayValue = override?.displayValue ??
        defaultNotional.toLocaleString("en-US", { maximumFractionDigits: 0, useGrouping: true });
      return {
        state: {
          displayValue,
          numericValue: override?.numericValue ?? defaultNotional,
          error: override?.error ?? null,
          isRfq: override?.isRfq ?? false,
          isDefault: override?.isDefault ?? true,
        },
        change: noop,
        reset: noop,
      };
    },
    // Throughput: static snapshot for screenshots; setValue is a no-op. Defaults
    // to a loaded value of 100 (loading:false) so the slider renders.
    useThroughput: () => ({
      value: data.throughput?.value ?? 100,
      loading: data.throughput?.loading ?? false,
      message: data.throughput?.message ?? null,
      setValue: noop,
    }),
  };
}
