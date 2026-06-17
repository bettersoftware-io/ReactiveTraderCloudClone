import {
  DEFAULT_THEME, DEFAULT_VIEW_MODE,
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
    // Commands: async no-ops. Not exercised by static screenshots, so the
    // non-void results are type-correct placeholders.
    useExecuteTrade: () => async (_input: ExecuteTradeInput) =>
      ({} as ExecuteTradeResult),
    useCreateRfq: () => async (_input: CreateRfqInput) => 0,
    useAcceptQuote: () => async (_quoteId: number) => {},
    useCancelRfq: () => async (_rfqId: number) => {},
    usePassQuote: () => async (_quoteId: number) => {},
    useQuoteRfq: () => async (_request: QuoteRequest) => {},
    useRequestRfqQuote: () => async (_symbol: string, _pipsPosition: number) =>
      ({} as RfqQuoteResult),
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
    // Submission machines: static snapshots for screenshots; intents are no-ops.
    useRfqSubmission: () => ({
      state: data.rfqSubmission ?? { status: "editing" },
      submit: noop,
    }),
    useTicketSubmission: () => ({
      state: data.ticketSubmission ?? { submitted: false },
      submitPrice: noop,
      pass: noop,
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
    // Display preferences: static snapshots for screenshots; setters are no-ops.
    useThemePreference: () => ({
      theme: data.theme ?? DEFAULT_THEME,
      setTheme: noop,
      toggle: noop,
    }),
    useViewModePreference: () => ({
      viewMode: data.viewMode ?? DEFAULT_VIEW_MODE,
      setViewMode: noop,
    }),
  };
}
