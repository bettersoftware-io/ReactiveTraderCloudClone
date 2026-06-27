import {
  type CurrencyPair,
  DEFAULT_THEME_MODE,
  DEFAULT_VIEW_MODE,
} from "@rtc/domain";

// The visual fakes pin the skin to "classic" by default (NOT the app's "holo"
// showcase default): classic's tokens are byte-identical to the pre-redesign
// single-axis tokens, so the deferred goldens stay pixel-identical until
// Phase 3 regenerates them for the new skins.
const DEFAULT_THEME_SKIN_FOR_FIXTURES = "classic" as const;

import {
  createDefaultLayoutPort,
  type WorkspaceTab,
} from "#/app/layout/defaultLayoutPort";
import type { BootSequenceState } from "#/app/presenters/BootSequenceMachine";
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
    useNewTradeIds: () => {
      return data.newTradeIds ?? new Set<number>();
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
    // Reconnect: static screenshots don't click buttons; no-op is correct.
    useReconnect: () => {
      return noop;
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
        mode: data.themeMode ?? DEFAULT_THEME_MODE,
        setMode: noop,
        toggle: noop,
      };
    },
    useThemeSkinPreference: () => {
      return {
        skin: data.themeSkin ?? DEFAULT_THEME_SKIN_FOR_FIXTURES,
        setSkin: noop,
      };
    },
    useAnimatedBackground: () => {
      return {
        enabled: data.animatedBackground ?? false,
        setEnabled: noop,
        toggle: noop,
      };
    },
    useViewModePreference: () => {
      return {
        viewMode: data.viewMode ?? DEFAULT_VIEW_MODE,
        setViewMode: noop,
      };
    },
    // Countdown: static snapshot for visual goldens — returns totalMs so the bar
    // renders at 100% fill (deterministic; never wall-clock-dependent).
    useRfqCountdown: (_creationTimestamp: number, totalMs: number) => {
      return totalMs;
    },
    // Animation intents: static screenshots never fire intents, so the bar
    // renders in its neutral, un-animated state.
    useAnimationIntents: (_target: string) => {
      return null;
    },
    // Layout: static snapshot for screenshots — returns the tab's default
    // arrangement with noop intents (no drag, no maximize during capture).
    useLayout: (tab: WorkspaceTab) => {
      return {
        state: createDefaultLayoutPort(tab).initial,
        maximize: noop,
        restore: noop,
        collapse: noop,
        expand: noop,
        resize: noop,
      };
    },
    // Boot sequence: visual goldens capture post-boot UI; return a static initial
    // state with noop skip. The BootSequence component is not rendered in any
    // existing golden scenario.
    useBootSequence: (_onDone: () => void) => {
      const state: BootSequenceState = {
        variant: "core",
        progress: 0,
        done: false,
      };
      return { state, skip: noop };
    },
  };
}
