import { BehaviorSubject } from "rxjs";

import {
  ConnectionStatus,
  type CreateRfqInput,
  type CurrencyPair,
  DEFAULT_THEME_MODE,
  DEFAULT_VIEW_MODE,
  type Dealer,
  type ExecuteTradeInput,
  type ExecuteTradeResult,
  type Instrument,
  type PositionUpdates,
  type Price,
  type PriceTick,
  type Quote,
  type QuoteRequest,
  type Rfq,
  type RfqQuoteResult,
  type ThemeMode,
  type ThemeSkin,
  type Trade,
  type ViewMode,
} from "@rtc/domain";

import {
  DEMO_USER,
  type SessionState,
} from "#/app/presenters/SessionPresenter";
import type { ThroughputView } from "#/app/presenters/ThroughputPresenter";

/** The value each NULLARY query hook yields. Parametric hooks (usePrice etc.)
 *  are modelled by the per-key subject maps below, not by this map. */
export interface HookValues {
  useConnectionStatus: ConnectionStatus;
  useTrades: readonly Trade[];
  useAnalytics: PositionUpdates | null;
  useRfqs: readonly Rfq[];
  useAllQuotes: ReadonlyMap<number, Quote>;
  useCurrencyPairs: readonly CurrencyPair[];
  useInstruments: readonly Instrument[];
  useDealers: readonly Dealer[];
}

const DEFAULTS: HookValues = {
  useConnectionStatus: ConnectionStatus.CONNECTED,
  useTrades: [],
  useAnalytics: null,
  useRfqs: [],
  useAllQuotes: new Map(),
  useCurrencyPairs: [],
  useInstruments: [],
  useDealers: [],
};

/**
 * Seed values for the PARAMETRIC query hooks. Each is keyed by the same
 * parameter the real hook takes:
 *   - usePrice(pair)            → keyed by pair.symbol
 *   - usePriceHistory(symbol)   → keyed by symbol
 * The adapter lazily creates a BehaviorSubject per key, so a tile that reads
 * usePrice("EURUSD") subscribes to its own subject and re-renders only when
 * that key is pushed — mirroring @react-rxjs `bind`'s per-argument streams.
 */
export interface ParametricSeed {
  prices?: Readonly<Record<string, Price | null>>;
  histories?: Readonly<Record<string, readonly PriceTick[]>>;
  /** Quotes per RFQ, keyed by rfqId (mirrors useQuotesForRfq(rfqId)). */
  quotesForRfq?: Readonly<Record<number, readonly Quote[]>>;
}

/**
 * Canned results emitted by command hooks. When a `*Throws` flag is set the
 * corresponding command's Observable errors instead of emitting, exercising the
 * catch path in the consuming hook (useExecuteTrade / useRfqQuote).
 */
export interface CommandResults {
  createRfq?: number;
  executeTrade?: ExecuteTradeResult;
  executeTradeThrows?: boolean;
  requestRfqQuote?: RfqQuoteResult;
  requestRfqQuoteThrows?: boolean;
}

/** Inputs captured from command hooks during a test. */
export interface CommandLog {
  createRfq: CreateRfqInput[];
  executeTrade: ExecuteTradeInput[];
  requestRfqQuote: { symbol: string; pipsPosition: number }[];
  acceptQuote: number[];
  passQuote: number[];
  quoteRfq: QuoteRequest[];
  /** Incremented each time useReconnect() callback is invoked. */
  reconnect: number;
  /** Incremented each time useSession().unlock() (re-authenticate) is invoked. */
  sessionUnlock: number;
}

/** The default throughput view a fresh World reports (loaded, value 100). */
const DEFAULT_THROUGHPUT: ThroughputView = {
  value: 100,
  loading: false,
  message: null,
};

/** The default session a fresh World reports: unlocked, static demo user. */
const DEFAULT_SESSION: SessionState = { locked: false, user: DEMO_USER };

export interface World {
  readonly sources: { [K in keyof HookValues]: BehaviorSubject<HookValues[K]> };
  /** Reactive throughput view backing useThroughput (drives AdminPanel). */
  readonly throughput: BehaviorSubject<ThroughputView>;
  /** Values captured from useThroughput().setValue calls. */
  readonly throughputSets: number[];
  /** Push a new throughput view (drives the AdminPanel's re-render). */
  setThroughputView(patch: Partial<ThroughputView>): void;
  /** Reactive theme-mode preference backing useThemePreference (drives ThemeProvider). */
  readonly themeMode: BehaviorSubject<ThemeMode>;
  /** Reactive theme-skin preference backing useThemeSkinPreference (drives ThemeProvider). */
  readonly themeSkin: BehaviorSubject<ThemeSkin>;
  /** Reactive animated-background preference backing useAnimatedBackground. */
  readonly animatedBackground: BehaviorSubject<boolean>;
  /** Reactive view-mode preference backing useViewModePreference (drives LiveRatesPanel). */
  readonly viewMode: BehaviorSubject<ViewMode>;
  /** Reactive session state backing useSession (drives LockScreen). */
  readonly session: BehaviorSubject<SessionState>;
  /** Per-key subject for usePrice(pair), keyed by pair.symbol. */
  priceFor(symbol: string): BehaviorSubject<Price | null>;
  /** Per-key subject for usePriceHistory(symbol). */
  historyFor(symbol: string): BehaviorSubject<readonly PriceTick[]>;
  /** Per-key subject for useQuotesForRfq(rfqId), keyed by rfqId. */
  quotesForRfq(rfqId: number): BehaviorSubject<readonly Quote[]>;
  /** Push a new price for one symbol (drives that tile's re-render). */
  setPrice(symbol: string, value: Price | null): void;
  /** Push a new price history for one symbol. */
  setHistory(symbol: string, value: readonly PriceTick[]): void;
  /** Push new quotes for one RFQ (drives that card's re-render). */
  setQuotesForRfq(rfqId: number, value: readonly Quote[]): void;
  readonly results: CommandResults;
  readonly commands: CommandLog;
  /** Push new values for one or more NULLARY hooks (drives re-renders). */
  push(patch: Partial<HookValues>): void;
}

export function createWorld(
  initial: Partial<HookValues> = {},
  results: CommandResults = {},
  parametric: ParametricSeed = {},
  throughputSeed: Partial<ThroughputView> = {},
  themeModeSeed?: ThemeMode,
  viewModeSeed?: ViewMode,
  themeSkinSeed?: ThemeSkin,
  animatedBackgroundSeed?: boolean,
  sessionSeed: Partial<SessionState> = {},
): World {
  const merged: HookValues = { ...DEFAULTS, ...initial };
  const sources = {} as {
    [K in keyof HookValues]: BehaviorSubject<HookValues[K]>;
  };

  for (const key of Object.keys(merged) as (keyof HookValues)[]) {
    // Each subject is typed by its own key; the cast bridges the per-key union.
    (sources[key] as BehaviorSubject<unknown>) = new BehaviorSubject<unknown>(
      merged[key],
    );
  }

  const prices = new Map<string, BehaviorSubject<Price | null>>();
  const histories = new Map<string, BehaviorSubject<readonly PriceTick[]>>();
  const quotes = new Map<number, BehaviorSubject<readonly Quote[]>>();

  function priceFor(symbol: string): BehaviorSubject<Price | null> {
    let subject = prices.get(symbol);

    if (!subject) {
      subject = new BehaviorSubject<Price | null>(null);
      prices.set(symbol, subject);
    }

    return subject;
  }

  function historyFor(symbol: string): BehaviorSubject<readonly PriceTick[]> {
    let subject = histories.get(symbol);

    if (!subject) {
      subject = new BehaviorSubject<readonly PriceTick[]>([]);
      histories.set(symbol, subject);
    }

    return subject;
  }

  function quotesForRfq(rfqId: number): BehaviorSubject<readonly Quote[]> {
    let subject = quotes.get(rfqId);

    if (!subject) {
      subject = new BehaviorSubject<readonly Quote[]>([]);
      quotes.set(rfqId, subject);
    }

    return subject;
  }

  for (const [symbol, value] of Object.entries(parametric.prices ?? {})) {
    priceFor(symbol).next(value);
  }

  for (const [symbol, value] of Object.entries(parametric.histories ?? {})) {
    historyFor(symbol).next(value);
  }

  for (const [rfqId, value] of Object.entries(parametric.quotesForRfq ?? {})) {
    quotesForRfq(Number(rfqId)).next(value);
  }

  const throughput = new BehaviorSubject<ThroughputView>({
    ...DEFAULT_THROUGHPUT,
    ...throughputSeed,
  });
  const throughputSets: number[] = [];

  // Stateful display preferences: setters/toggle push back onto these subjects so
  // a click through the seam re-renders the consuming component (ThemeProvider /
  // LiveRatesPanel), mirroring the PreferencesPort's replay-current streams.
  const themeMode = new BehaviorSubject<ThemeMode>(
    themeModeSeed ?? DEFAULT_THEME_MODE,
  );
  // The harness pins the skin to "classic" by default (NOT the app's "holo"
  // showcase default): classic's tokens are byte-identical to the pre-redesign
  // single-axis tokens, so existing contract snapshots and deferred visual
  // goldens stay stable until Phase 3 regenerates them for the new skins.
  const themeSkin = new BehaviorSubject<ThemeSkin>(themeSkinSeed ?? "classic");
  const animatedBackground = new BehaviorSubject<boolean>(
    animatedBackgroundSeed ?? false,
  );
  const viewMode = new BehaviorSubject<ViewMode>(
    viewModeSeed ?? DEFAULT_VIEW_MODE,
  );
  const session = new BehaviorSubject<SessionState>({
    ...DEFAULT_SESSION,
    ...sessionSeed,
    user: { ...DEFAULT_SESSION.user, ...sessionSeed.user },
  });

  return {
    sources,
    throughput,
    throughputSets,
    setThroughputView: (patch: Partial<ThroughputView>) => {
      return throughput.next({ ...throughput.getValue(), ...patch });
    },
    themeMode,
    themeSkin,
    animatedBackground,
    viewMode,
    session,
    priceFor,
    historyFor,
    quotesForRfq,
    setPrice: (symbol: string, value: Price | null) => {
      return priceFor(symbol).next(value);
    },
    setHistory: (symbol: string, value: readonly PriceTick[]) => {
      return historyFor(symbol).next(value);
    },
    setQuotesForRfq: (rfqId: number, value: readonly Quote[]) => {
      return quotesForRfq(rfqId).next(value);
    },
    results,
    commands: {
      createRfq: [],
      executeTrade: [],
      requestRfqQuote: [],
      acceptQuote: [],
      passQuote: [],
      quoteRfq: [],
      reconnect: 0,
      sessionUnlock: 0,
    },
    push(patch: Partial<HookValues>): void {
      for (const key of Object.keys(patch) as (keyof HookValues)[]) {
        (sources[key] as BehaviorSubject<unknown>).next(patch[key]);
      }
    },
  };
}
