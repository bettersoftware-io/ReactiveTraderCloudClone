// Framework-neutral snapshot of everything the UI reads through AppHooks.
// No React/Solid imports — this file (and the rest of shared/) is the
// portable core shared by every UI implementation.
import {
  ConnectionStatus,
  type CurrencyPair,
  type Dealer,
  type Instrument,
  type PositionUpdates,
  type Price,
  type PriceTick,
  type Quote,
  type Rfq,
  type ThemeMode,
  type ThemeSkin,
  type Trade,
  type ViewMode,
} from "@rtc/domain";

import type { NotionalView } from "#/app/presenters/NotionalMachine";
import type {
  RfqSubmissionState,
  TicketSubmissionState,
} from "#/app/presenters/RfqsPresenter";
import type { RfqState } from "#/app/presenters/RfqTileMachine";
import type { ThroughputView } from "#/app/presenters/ThroughputPresenter";
import type { TileExecutionState } from "#/app/presenters/TileExecutionMachine";

export interface AppData {
  prices: Record<string, Price | null>;
  priceHistory: Record<string, readonly PriceTick[]>;
  trades: readonly Trade[];
  /** Ids the blotter should flag as newly arrived (useNewTradeIds); defaults to none. */
  newTradeIds?: ReadonlySet<number>;
  analytics: PositionUpdates | null;
  rfqs: readonly Rfq[];
  quotesForRfq: Record<number, readonly Quote[]>;
  allQuotes: ReadonlyMap<number, Quote>;
  currencyPairs: readonly CurrencyPair[];
  instruments: readonly Instrument[];
  dealers: readonly Dealer[];
  connectionStatus: ConnectionStatus;
  /** Per-symbol tile execution overlay state; a missing key defaults to "ready". */
  tileExecution: Record<string, TileExecutionState>;
  /** Per-symbol RFQ tile state; a missing key defaults to "init". */
  rfqTile: Record<string, RfqState>;
  /** Per-symbol stale flag for tiles (useStaleFlag); a missing key defaults to false. */
  stale: Record<string, boolean>;
  /** Stale flag for the analytics panel (useAnalyticsStaleFlag); defaults to false. */
  analyticsStale?: boolean;
  /** Notional view override for TileNotional screenshots; defaults to formatted defaultNotional. */
  notional?: NotionalView;
  /** NewRfqForm submission state (useRfqSubmission); defaults to "editing". */
  rfqSubmission?: RfqSubmissionState;
  /** TradeTicket submission state (useTicketSubmission); defaults to not submitted. */
  ticketSubmission?: TicketSubmissionState;
  /** Throughput control view (useThroughput); defaults to a loaded value of 100. */
  throughput?: ThroughputView;
  /** Theme-mode preference (useThemePreference); defaults to DEFAULT_THEME_MODE ("dark"). */
  themeMode?: ThemeMode;
  /** Theme-skin preference (useThemeSkinPreference); defaults to "classic" in the fakes. */
  themeSkin?: ThemeSkin;
  /** Animated-background preference (useAnimatedBackground); defaults to false. */
  animatedBackground?: boolean;
  /** Live-rates view-mode preference (useViewModePreference); defaults to DEFAULT_VIEW_MODE ("chart"). */
  viewMode?: ViewMode;
}

/** A fully-populated empty baseline; fixtures override only what they exercise. */
const defaultAppData: AppData = {
  prices: {},
  priceHistory: {},
  trades: [],
  analytics: null,
  rfqs: [],
  quotesForRfq: {},
  allQuotes: new Map(),
  currencyPairs: [],
  instruments: [],
  dealers: [],
  connectionStatus: ConnectionStatus.CONNECTED,
  tileExecution: {},
  rfqTile: {},
  stale: {},
};

/** Shallow-merge a partial fixture over the baseline. */
export function makeAppData(overrides: Partial<AppData>): AppData {
  return { ...defaultAppData, ...overrides };
}
