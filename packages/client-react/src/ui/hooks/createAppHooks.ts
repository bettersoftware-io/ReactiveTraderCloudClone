import { bind } from "@react-rxjs/core";
import { firstValueFrom } from "rxjs";

import {
  ConnectionStatus,
  type CurrencyPair,
  DEFAULT_THEME,
  DEFAULT_VIEW_MODE,
  type Dealer,
  type Instrument,
  type PositionUpdates,
  type Price,
  type PriceTick,
  type Quote,
  type Rfq,
  type Theme,
  type Trade,
  type ViewMode,
} from "@rtc/domain";

import type { Presenters } from "#/app/composition";
import type { MachineFactories } from "#/app/presenters/machine";
import type {
  NotionalIntents,
  NotionalView,
} from "#/app/presenters/NotionalMachine";
import type {
  RfqSubmissionIntents,
  RfqSubmissionState,
  TicketSubmissionIntents,
  TicketSubmissionState,
} from "#/app/presenters/RfqsPresenter";
import type { RfqState, RfqTileIntents } from "#/app/presenters/RfqTileMachine";
import type { ThroughputView } from "#/app/presenters/ThroughputPresenter";
import type {
  TileExecutionIntents,
  TileExecutionState,
} from "#/app/presenters/TileExecutionMachine";

import { useMachine } from "./useMachine";

export interface AppHooks {
  // Streams
  usePrice: (pair: CurrencyPair) => Price | null;
  usePriceHistory: (symbol: string) => readonly PriceTick[];
  useTrades: () => readonly Trade[];
  useAnalytics: () => PositionUpdates | null;
  useRfqs: () => readonly Rfq[];
  useQuotesForRfq: (rfqId: number) => readonly Quote[];
  useAllQuotes: () => ReadonlyMap<number, Quote>;
  useCurrencyPairs: () => readonly CurrencyPair[];
  useInstruments: () => readonly Instrument[];
  useDealers: () => readonly Dealer[];
  useConnectionStatus: () => ConnectionStatus;
  // Commands (one-shot fire-and-await; the bridge does firstValueFrom)
  useAcceptQuote: () => (quoteId: number) => Promise<void>;
  // Machines (app-layer RxJS behind the useMachine bridge)
  useTileExecution: (
    pair: CurrencyPair,
  ) => { state: TileExecutionState } & TileExecutionIntents;
  useRfqTile: (pair: CurrencyPair) => { state: RfqState } & RfqTileIntents;
  // Intent-free derived flags: return just the boolean (no intents to expose).
  useStaleFlag: (pair: CurrencyPair) => boolean;
  useAnalyticsStaleFlag: () => boolean;
  /** Transient new-row highlight for a blotter row (`isNew` captured at mount). */
  useRowHighlight: (isNew: boolean) => boolean;
  /** Notional input state for a tile — view state plus intents. */
  useNotional: (
    defaultNotional: number,
  ) => { state: NotionalView } & NotionalIntents;
  /** NewRfqForm create→confirm→redirect submission state plus the submit intent. */
  useRfqSubmission: () => { state: RfqSubmissionState } & RfqSubmissionIntents;
  /** TradeTicket submit-price / pass submission state plus its intents. */
  useTicketSubmission: () => {
    state: TicketSubmissionState;
  } & TicketSubmissionIntents;
  /** Global throughput control — shared view state plus the setValue intent. */
  useThroughput: () => ThroughputView & { setValue: (value: number) => void };
  /** Global theme preference — current theme plus write/zero-arg-toggle intents. */
  useThemePreference: () => {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    toggle: () => void;
  };
  /** Global live-rates view-mode preference — current mode plus the write intent. */
  useViewModePreference: () => {
    viewMode: ViewMode;
    setViewMode: (viewMode: ViewMode) => void;
  };
}

export function createAppHooks(
  presenters: Presenters,
  machines: MachineFactories,
): AppHooks {
  const [usePrice] = bind(
    (pair: CurrencyPair) => presenters.priceStream.price$(pair),
    null,
  );
  const [usePriceHistory] = bind(
    (symbol: string) => presenters.priceHistory.history$(symbol),
    [] as readonly PriceTick[],
  );
  const [useTrades] = bind(presenters.blotter.trades$, [] as readonly Trade[]);
  const [useAnalytics] = bind(
    presenters.analytics.position$,
    null as PositionUpdates | null,
  );
  const [useRfqs] = bind(presenters.rfqs.rfqs$, [] as readonly Rfq[]);
  const [useQuotesForRfq] = bind(
    (rfqId: number) => presenters.rfqs.quotesForRfq$(rfqId),
    [] as readonly Quote[],
  );
  const [useAllQuotes] = bind(
    presenters.rfqs.allQuotes$,
    new Map() as ReadonlyMap<number, Quote>,
  );
  const [useCurrencyPairs] = bind(
    presenters.currencyPairs.pairs$,
    [] as readonly CurrencyPair[],
  );
  const [useInstruments] = bind(
    presenters.instruments.list$,
    [] as readonly Instrument[],
  );
  const [useDealers] = bind(presenters.dealers.list$, [] as readonly Dealer[]);
  const [useConnectionStatus] = bind(
    presenters.connection.status$,
    ConnectionStatus.CONNECTING,
  );
  // Global/shared throughput state → a plain bind (not a per-mount machine).
  const [useThroughputState] = bind(presenters.throughput.state$, {
    value: 100,
    loading: true,
    message: null,
  } as ThroughputView);
  const setThroughput = (value: number) =>
    presenters.throughput.setValue(value);

  // Global/shared display preferences → plain binds (not per-mount machines).
  const [useThemeValue] = bind(
    presenters.themePreference.theme$,
    DEFAULT_THEME,
  );
  const setTheme = (theme: Theme) => presenters.themePreference.setTheme(theme);
  const [useViewModeValue] = bind(
    presenters.viewModePreference.viewMode$,
    DEFAULT_VIEW_MODE,
  );
  const setViewMode = (viewMode: ViewMode) =>
    presenters.viewModePreference.setViewMode(viewMode);

  // Pre-bound command callbacks. Stable references across calls so React
  // memo/effect dep arrays remain stable. The bridge converts each one-shot
  // presenter Observable to a Promise via firstValueFrom — the void commands'
  // presenters emit `undefined` before completing, so firstValueFrom resolves
  // (rather than rejecting with EmptyError) without needing a defaultValue.
  const acceptQuote = (quoteId: number) =>
    firstValueFrom(presenters.rfqs.acceptQuote(quoteId));

  return {
    usePrice,
    usePriceHistory,
    useTrades,
    useAnalytics,
    useRfqs,
    useQuotesForRfq,
    useAllQuotes,
    useCurrencyPairs,
    useInstruments,
    useDealers,
    useConnectionStatus,
    useAcceptQuote: () => acceptQuote,
    useTileExecution: (pair: CurrencyPair) =>
      useMachine(() => machines.tileExecution(pair)),
    useRfqTile: (pair: CurrencyPair) =>
      useMachine(() => machines.rfqTile(pair)),
    useStaleFlag: (pair: CurrencyPair) =>
      useMachine(() => machines.staleFlag(pair)).state,
    useAnalyticsStaleFlag: () =>
      useMachine(() => machines.analyticsStaleFlag()).state,
    useRowHighlight: (isNew: boolean) =>
      useMachine(() => machines.rowHighlight(isNew)).state,
    useNotional: (defaultNotional: number) =>
      useMachine(() => machines.notional(defaultNotional)),
    useRfqSubmission: () => useMachine(() => machines.rfqSubmission()),
    useTicketSubmission: () => useMachine(() => machines.ticketSubmission()),
    useThroughput: () => ({ ...useThroughputState(), setValue: setThroughput }),
    // Global theme: read the currently-bound theme in the hook body so the
    // component calls a zero-arg toggle() that flips relative to the live value.
    useThemePreference: () => {
      const theme = useThemeValue();
      return {
        theme,
        setTheme,
        toggle: () => presenters.themePreference.toggle(theme),
      };
    },
    useViewModePreference: () => ({
      viewMode: useViewModeValue(),
      setViewMode,
    }),
  };
}
