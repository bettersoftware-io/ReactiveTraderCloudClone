import type { EqDrawingsState, EqWorkspaceState } from "@rtc/client-core";
import {
  type Candle,
  type ChartSubstrate,
  DEFAULT_CHART_SUBSTRATE,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  type DepthBook,
  type DepthLevel,
  type EqBlotterView,
  type EquityInstrument,
  type EquityOrder,
  type EquityPosition,
  type EquityQuote,
  type EqWatchlistSort,
} from "@rtc/domain";

import { MINUTE_MS, PINNED_NOW_MS } from "./pinnedClock";
import type { EquitiesSlice } from "./sliceTypes";

/** No-op slot for every write-intent below (`setX`/`submit`/`reset`/…) — a
 * single shared reference is fine because TS assigns a shorter-arity `()
 * => void` to any of these slots' wider signatures (extra args are simply
 * ignored), mirroring the identical `noop` in the web sibling
 * (`packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`).
 * Screenshots never press buttons, so none of these are ever called. */
function noop(): void {}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The real watchlist roster `EquityMarketDataSimulator` serves — copied
 * here as literals because `WATCHLIST` in
 * `packages/domain/src/simulators/EquityMarketDataSimulator.ts` is
 * domain-internal (not exported). Six symbols, so this fake owns quote/
 * candle/depth fixtures for all six, not just the pinned AAPL — MoversBoard
 * and SectorHeatmap render one row/cell per watchlist entry. If the real
 * roster ever changes, this list silently drifts out of sync; there is no
 * compile-time link back to the simulator. */
const WATCHLIST: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ" },
  { symbol: "AMZN", name: "Amazon.com Inc.", exchange: "NASDAQ" },
  { symbol: "JPM", name: "JPMorgan Chase", exchange: "NYSE" },
  { symbol: "XOM", name: "Exxon Mobil", exchange: "NYSE" },
];

/** Per-symbol last price — shared by the quote and candle fixtures below so
 * a symbol's sparkline/chart plausibly ends near its quoted price. */
const LAST_PRICE: Readonly<Record<string, number>> = {
  AAPL: 191.9,
  MSFT: 414.2,
  TSLA: 257.7,
  AMZN: 174.7,
  JPM: 201.65,
  XOM: 107.7,
};

/** Per-symbol change%, deliberately spanning both signs and a range of
 * magnitudes: `MoversBoard` ranks and colours by this, and
 * `SectorHeatmap`'s tint intensity comes from it too — an all-positive (or
 * all-uniform) roster would only ever exercise one visual branch of each. */
const CHANGE_PCT: Readonly<Record<string, number>> = {
  AAPL: 1.35,
  MSFT: -0.62,
  TSLA: 3.92,
  AMZN: -2.15,
  JPM: 0.18,
  XOM: -1.05,
};

function buildQuote(
  symbol: string,
  last: number,
  changePct: number,
): EquityQuote {
  const half = round2(last * 0.0005);
  return {
    symbol,
    bid: round2(last - half),
    ask: round2(last + half),
    last,
    changePct,
    timestamp: PINNED_NOW_MS,
  };
}

/** One frozen `EquityQuote` per watchlist symbol — built once at module
 * load, so `useEquityQuote(symbol)` returns the identical object on every
 * call for the same symbol (the `toBe` identity the brief requires). */
const QUOTES: Readonly<Record<string, EquityQuote>> = {
  AAPL: buildQuote(
    "AAPL",
    LAST_PRICE.AAPL as number,
    CHANGE_PCT.AAPL as number,
  ),
  MSFT: buildQuote(
    "MSFT",
    LAST_PRICE.MSFT as number,
    CHANGE_PCT.MSFT as number,
  ),
  TSLA: buildQuote(
    "TSLA",
    LAST_PRICE.TSLA as number,
    CHANGE_PCT.TSLA as number,
  ),
  AMZN: buildQuote(
    "AMZN",
    LAST_PRICE.AMZN as number,
    CHANGE_PCT.AMZN as number,
  ),
  JPM: buildQuote("JPM", LAST_PRICE.JPM as number, CHANGE_PCT.JPM as number),
  XOM: buildQuote("XOM", LAST_PRICE.XOM as number, CHANGE_PCT.XOM as number),
};

/** Candles per symbol — matches `EquityMarketDataSimulator`'s own "1D"
 * bucket count (one-minute buckets), so both `RowSparkline` (movers row) and
 * `CandleChart` (trade view) get a series that reads as a real chart, not a
 * two-point stub. */
const CANDLE_COUNT = 60;

/** Deterministic pure-math wave (`Math.sin`/`Math.cos` of the bucket index —
 * NOT `Math.random`), so every candle's OHLC is a fixed function of its
 * inputs: same output on every call, no entropy source, matching the same
 * "pure function of its arguments" exemption `pinnedClock.ts` documents for
 * `Date.UTC`. `seed` only shifts the phase per symbol so the six series
 * don't all move in lockstep. */
function buildCandles(basePrice: number, seed: number): readonly Candle[] {
  const candles: Candle[] = [];
  let closePrev = round2(basePrice);

  for (let i = CANDLE_COUNT - 1; i >= 0; i--) {
    const time = PINNED_NOW_MS - i * MINUTE_MS;
    const open = closePrev;
    const drift = Math.sin((i + seed) * 0.37) * basePrice * 0.004;
    const close = round2(basePrice + drift);
    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);
    // Wicks are always >= 1 cent, so after rounding `high` is strictly
    // greater than `bodyHigh` and `low` strictly less than `bodyLow` — the
    // OHLC invariant (`low <= min(open,close) && max(open,close) <= high`)
    // holds by construction, not by luck of the rounding.
    const wickUp = round2(
      Math.abs(Math.sin((i + seed) * 0.53)) * basePrice * 0.0015 + 0.01,
    );

    const wickDown = round2(
      Math.abs(Math.cos((i + seed) * 0.61)) * basePrice * 0.0015 + 0.01,
    );
    const high = round2(bodyHigh + wickUp);
    const low = round2(bodyLow - wickDown);
    const volume =
      500_000 + Math.round(Math.abs(Math.sin((i + seed) * 0.19)) * 400_000);

    candles.push({ time, open, high, low, close, volume });
    closePrev = close;
  }

  return candles;
}

const CANDLES: Readonly<Record<string, readonly Candle[]>> = {
  AAPL: buildCandles(LAST_PRICE.AAPL as number, 11),
  MSFT: buildCandles(LAST_PRICE.MSFT as number, 23),
  TSLA: buildCandles(LAST_PRICE.TSLA as number, 37),
  AMZN: buildCandles(LAST_PRICE.AMZN as number, 49),
  JPM: buildCandles(LAST_PRICE.JPM as number, 61),
  XOM: buildCandles(LAST_PRICE.XOM as number, 73),
};

const EMPTY_CANDLES: readonly Candle[] = [];

/** `DepthLadder` slices each side to its top 8 levels — matches
 * `EquityMarketDataSimulator`'s own `DEPTH_LEVELS`. */
const DEPTH_LEVEL_COUNT = 8;

/** Bids descending, asks ascending, both straddling `last` by an increasing
 * tick per level — same shape as `EquityMarketDataSimulator.depth()`, so the
 * two sides never cross. `seed` only varies the per-level size, via modulo
 * arithmetic (no RNG). */
function buildDepth(symbol: string, last: number, seed: number): DepthBook {
  const tick = round2(last * 0.0006);
  const bids: DepthLevel[] = [];
  const asks: DepthLevel[] = [];

  for (let i = 0; i < DEPTH_LEVEL_COUNT; i++) {
    const step = tick * (i + 1);
    bids.push({
      price: round2(last - step),
      size: 100 + ((seed + i * 37) % 900),
    });
    asks.push({
      price: round2(last + step),
      size: 100 + ((seed + i * 53) % 900),
    });
  }

  return { symbol, bids, asks };
}

const DEPTH: Readonly<Record<string, DepthBook>> = {
  AAPL: buildDepth("AAPL", LAST_PRICE.AAPL as number, 11),
  MSFT: buildDepth("MSFT", LAST_PRICE.MSFT as number, 23),
  TSLA: buildDepth("TSLA", LAST_PRICE.TSLA as number, 37),
  AMZN: buildDepth("AMZN", LAST_PRICE.AMZN as number, 49),
  JPM: buildDepth("JPM", LAST_PRICE.JPM as number, 61),
  XOM: buildDepth("XOM", LAST_PRICE.XOM as number, 73),
};

/** `equities/blotter` used to mount `OrdersBlotter`/`PositionsBlotter` with
 * both feeds empty — an empty-state golden that asserts almost nothing about
 * either table. Seeding a few rows here means that scenario's golden will
 * capture a populated blotter instead once recaptured; that is an intended
 * change, not a regression, and both tables' populated render paths are now
 * exercised by the pixel tier. Spans more than one `OrderStatus` (filled /
 * working / partiallyFilled / cancelled / rejected) and both `OrderSide`s. */
const ORDERS: readonly EquityOrder[] = [
  {
    id: "ord-1",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 100,
    status: "filled",
    filledQty: 100,
    avgPrice: 191.85,
    createdAt: PINNED_NOW_MS - 5 * MINUTE_MS,
  },
  {
    id: "ord-2",
    symbol: "MSFT",
    side: "sell",
    type: "limit",
    qty: 50,
    limitPrice: 415,
    status: "working",
    filledQty: 0,
    createdAt: PINNED_NOW_MS - 4 * MINUTE_MS,
  },
  {
    id: "ord-3",
    symbol: "TSLA",
    side: "buy",
    type: "limit",
    qty: 75,
    limitPrice: 250,
    status: "partiallyFilled",
    filledQty: 30,
    avgPrice: 249.8,
    createdAt: PINNED_NOW_MS - 3 * MINUTE_MS,
  },
  {
    id: "ord-4",
    symbol: "AMZN",
    side: "sell",
    type: "market",
    qty: 40,
    status: "cancelled",
    filledQty: 0,
    createdAt: PINNED_NOW_MS - 2 * MINUTE_MS,
  },
  {
    id: "ord-5",
    symbol: "JPM",
    side: "buy",
    type: "limit",
    qty: 60,
    limitPrice: 199,
    status: "rejected",
    filledQty: 0,
    createdAt: PINNED_NOW_MS - MINUTE_MS,
  },
];

/** A few open positions (not the whole watchlist) — enough for
 * `PositionsBlotter`'s populated path and `DeskPnlGauge`'s gauge, spanning
 * both a profit and a loss. */
const POSITIONS: readonly EquityPosition[] = [
  {
    symbol: "AAPL",
    qty: 200,
    avgPrice: 185.4,
    markPrice: 191.9,
    unrealisedPnl: 1300,
  },
  {
    symbol: "TSLA",
    qty: 80,
    avgPrice: 260.1,
    markPrice: 257.7,
    unrealisedPnl: -192,
  },
  {
    symbol: "JPM",
    qty: 150,
    avgPrice: 198.2,
    markPrice: 201.65,
    unrealisedPnl: 517.5,
  },
];

/** Default shared eq-workspace/eq-drawings/preference snapshots — none of
 * these four hooks (`useEqWorkspace`, `useEqDrawings`, `useEqBlotterView`,
 * `useChartSubstrate`) is read by any RN component today (`MarketsView`,
 * `TradeView`, `BlottersView` and everything under them read only the other
 * nine keys in this slice), so they exist purely for `ViewModel`
 * completeness. Each mirrors the app's own shipped default rather than
 * inventing one. */
const EQ_WORKSPACE_STATE: EqWorkspaceState = {
  sel: "",
  openTabs: [],
  timeframe: "1D",
  chartType: "candles",
  indicators: [],
  panes: [],
  yScale: "linear",
  compare: null,
};

const EQ_DRAWINGS_STATE: EqDrawingsState = {
  tool: "cursor",
  drawings: {},
  selectedId: null,
};

export const equitiesSlice: EquitiesSlice = {
  useWatchlist: () => {
    return WATCHLIST;
  },
  useEquityQuote: (symbol: string) => {
    return QUOTES[symbol] ?? null;
  },
  // The one member of `EquitiesSlice` that is not a `use*` hook — a bare
  // command paired with `useCandleBackfill`'s state, forwarding a near-edge
  // chart scroll's "load an older page" request in production. Inert here,
  // like every other intent: a screenshot never scrolls a chart. Crucially
  // it must stay a true no-op — it must NOT mutate `CANDLES`, or a capture
  // that happens to call it would drift `useCandles`' return out from under
  // itself, reintroducing exactly the kind of non-determinism this whole
  // fake exists to remove.
  loadOlderCandles: noop,
  useCandles: (symbol: string) => {
    return CANDLES[symbol] ?? EMPTY_CANDLES;
  },
  // Static screenshots never trigger a near-edge backfill — both flags stay
  // at their real default (both false), matching the web sibling.
  useCandleBackfill: () => {
    return { loadingOlder: false, historyExhausted: false };
  },
  useDepth: (symbol: string) => {
    return DEPTH[symbol] ?? null;
  },
  useEquityOrders: () => {
    return ORDERS;
  },
  useEquityPositions: () => {
    return POSITIONS;
  },
  // Editing arm, form seeded from the caller's defaultSymbol — the only arm
  // any of the three scenarios exercise (OrderTicket always mounts with a
  // fresh per-symbol machine, never mid-submission).
  useOrderTicket: (defaultSymbol: string) => {
    return {
      state: {
        phase: "editing" as const,
        form: {
          symbol: defaultSymbol,
          side: "buy" as const,
          type: "market" as const,
          qty: 0,
        },
        error: null,
      },
      setSymbol: noop,
      setSide: noop,
      setType: noop,
      setQty: noop,
      setLimitPrice: noop,
      submit: noop,
      reset: noop,
    };
  },
  useEqWorkspace: () => {
    return {
      state: EQ_WORKSPACE_STATE,
      select: noop,
      closeTab: noop,
      setTimeframe: noop,
      setChartType: noop,
      toggleIndicator: noop,
      togglePane: noop,
      toggleYScale: noop,
      setCompare: noop,
    };
  },
  useEqDrawings: () => {
    return {
      state: EQ_DRAWINGS_STATE,
      setTool: noop,
      addDrawing: noop,
      updateDrawing: noop,
      selectDrawing: noop,
      deleteSelected: noop,
      shiftAnchors: noop,
    };
  },
  useEqWatchlistSort: () => {
    const sort: EqWatchlistSort = DEFAULT_EQ_WATCHLIST_SORT;
    return { sort, setSort: noop, cycle: noop };
  },
  useEqBlotterView: () => {
    const view: EqBlotterView = DEFAULT_EQ_BLOTTER_VIEW;
    return { view, setView: noop };
  },
  useChartSubstrate: () => {
    const substrate: ChartSubstrate = DEFAULT_CHART_SUBSTRATE;
    return { substrate, setSubstrate: noop };
  },
};
