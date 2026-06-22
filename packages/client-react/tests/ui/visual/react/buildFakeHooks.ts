import {
  type CurrencyPair,
  DEFAULT_THEME,
  DEFAULT_VIEW_MODE,
} from "@rtc/domain";

import type { NotionalView } from "#/app/presenters/NotionalMachine";
import type { AppHooks } from "#/ui/hooks/createAppHooks";

import type { AppData } from "../shared/appData";

function noop(): void {}

export function buildFakeHooks(data: AppData): AppHooks {
  return {
    usePrice: (pair: CurrencyPair) => {
      return data.prices[pair.symbol] ?? null;
    },
    usePriceHistory: (symbol: string) => {
      return data.priceHistory[symbol] ?? [];
    },
    useTrades: () => {
      return data.trades;
    },
    useAnalytics: () => {
      return data.analytics;
    },
    useRfqs: () => {
      return data.rfqs;
    },
    useQuotesForRfq: (rfqId: number) => {
      return data.quotesForRfq[rfqId] ?? [];
    },
    useAllQuotes: () => {
      return data.allQuotes;
    },
    useCurrencyPairs: () => {
      return data.currencyPairs;
    },
    useInstruments: () => {
      return data.instruments;
    },
    useDealers: () => {
      return data.dealers;
    },
    useConnectionStatus: () => {
      return data.connectionStatus;
    },
    // Commands: async no-op. Not exercised by static screenshots.
    useAcceptQuote: () => {
      return async (_quoteId: number) => {};
    },
    // Machine: per-symbol static snapshot for screenshots; intents are no-ops.
    // A missing key renders the same neutral state the real machine emits
    // initially ("ready" / "init"), so existing goldens are unchanged.
    useTileExecution: (pair: CurrencyPair) => {
      return {
        state: data.tileExecution[pair.symbol] ?? { status: "ready" },
        execute: noop,
        dismiss: noop,
      };
    },
    useRfqTile: (pair: CurrencyPair) => {
      return {
        state: data.rfqTile[pair.symbol] ?? {
          status: "init",
          quote: null,
          remainingMs: 0,
        },
        requestQuote: noop,
        cancel: noop,
        reject: noop,
        accept: noop,
      };
    },
    // Submission machines: static snapshots for screenshots; intents are no-ops.
    useRfqSubmission: () => {
      return {
        state: data.rfqSubmission ?? { status: "editing" },
        submit: noop,
      };
    },
    useTicketSubmission: () => {
      return {
        state: data.ticketSubmission ?? { submitted: false },
        submitPrice: noop,
        pass: noop,
      };
    },
    // Intent-free derived flags: static snapshot for screenshots.
    useStaleFlag: (pair: CurrencyPair) => {
      return data.stale[pair.symbol] ?? false;
    },
    useAnalyticsStaleFlag: () => {
      return data.analyticsStale ?? false;
    },
    // New-row highlight: deterministic — the highlight tracks isNew instantly (no
    // timer), so the highlighted (isNew) branch is snapshotted with no waiting.
    useRowHighlight: (isNew: boolean) => {
      return isNew;
    },
    // Machine: static snapshot for screenshots; intents are no-ops.
    useNotional: (defaultNotional: number) => {
      const override = data.notional as NotionalView | undefined;
      const displayValue =
        override?.displayValue ??
        defaultNotional.toLocaleString("en-US", {
          maximumFractionDigits: 0,
          useGrouping: true,
        });
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
    useThroughput: () => {
      return {
        value: data.throughput?.value ?? 100,
        loading: data.throughput?.loading ?? false,
        message: data.throughput?.message ?? null,
        setValue: noop,
      };
    },
    // Display preferences: static snapshots for screenshots; setters are no-ops.
    useThemePreference: () => {
      return {
        theme: data.theme ?? DEFAULT_THEME,
        setTheme: noop,
        toggle: noop,
      };
    },
    useViewModePreference: () => {
      return {
        viewMode: data.viewMode ?? DEFAULT_VIEW_MODE,
        setViewMode: noop,
      };
    },
  };
}
