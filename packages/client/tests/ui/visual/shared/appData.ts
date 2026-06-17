// Framework-neutral snapshot of everything the UI reads through AppHooks.
// No React/Solid imports — this file (and the rest of shared/) is the
// portable core shared by every UI implementation.
import {
  ConnectionStatus,
  type CurrencyPair, type Price, type PriceTick, type Trade,
  type Rfq, type Quote, type PositionUpdates,
  type Instrument, type Dealer,
  type Theme, type ViewMode,
} from "@rtc/domain";
import type { TileExecutionState } from "../../../../src/app/presenters/TileExecutionMachine";
import type { RfqState } from "../../../../src/app/presenters/RfqTileMachine";
import type { NotionalView } from "../../../../src/app/presenters/NotionalMachine";
import type {
  RfqSubmissionState,
  TicketSubmissionState,
} from "../../../../src/app/presenters/RfqsPresenter";
import type { ThroughputView } from "../../../../src/app/presenters/ThroughputPresenter";

export interface AppData {
  prices: Record<string, Price | null>;
  priceHistory: Record<string, readonly PriceTick[]>;
  trades: readonly Trade[];
  analytics: PositionUpdates | null;
  rfqs: readonly Rfq[];
  quotesForRfq: Record<number, readonly Quote[]>;
  allQuotes: ReadonlyMap<number, Quote>;
  currencyPairs: readonly CurrencyPair[];
  instruments: readonly Instrument[];
  dealers: readonly Dealer[];
  connectionStatus: ConnectionStatus;
  /** Tile execution overlay state; defaults to "ready" when omitted. */
  tileExecution?: TileExecutionState;
  /** RFQ tile state; defaults to "init" when omitted. */
  rfqTile?: RfqState;
  /** Per-symbol stale flag for tiles (useStaleFlag); defaults to false. */
  stale?: Record<string, boolean>;
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
  /** Theme preference (useThemePreference); defaults to DEFAULT_THEME ("dark"). */
  theme?: Theme;
  /** Live-rates view-mode preference (useViewModePreference); defaults to DEFAULT_VIEW_MODE ("chart"). */
  viewMode?: ViewMode;
}

/** A fully-populated empty baseline; fixtures override only what they exercise. */
export const defaultAppData: AppData = {
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
};

/** Shallow-merge a partial fixture over the baseline. */
export function makeAppData(overrides: Partial<AppData>): AppData {
  return { ...defaultAppData, ...overrides };
}
