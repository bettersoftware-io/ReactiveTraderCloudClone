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
 * domain-internal (not exported). The mobile-v1 design's eight symbols
 * (`_seedStocks` in the standalone prototype), so this fake owns quote/
 * candle/depth fixtures for all eight, not just the pinned NVDA —
 * MoversBoard renders one row per watchlist entry. If the real
 * roster ever changes, this list silently drifts out of sync; there is no
 * compile-time link back to the simulator. */
const WATCHLIST: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ" },
  { symbol: "NVDA", name: "NVIDIA Corp", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ" },
  { symbol: "AMZN", name: "Amazon.com", exchange: "NASDAQ" },
  { symbol: "META", name: "Meta Platforms", exchange: "NASDAQ" },
  { symbol: "GOOGL", name: "Alphabet A", exchange: "NASDAQ" },
  { symbol: "NFLX", name: "Netflix Inc", exchange: "NASDAQ" },
];

/** Per-symbol last price — the design prototype's `px` seeds verbatim.
 * Shared by the quote and candle fixtures below so a symbol's sparkline/
 * chart plausibly ends near its quoted price. */
const LAST_PRICE: Readonly<Record<string, number>> = {
  AAPL: 227.4,
  NVDA: 131.2,
  TSLA: 248.9,
  MSFT: 441.1,
  AMZN: 186.3,
  META: 511.8,
  GOOGL: 172.6,
  NFLX: 645.2,
};

/** Per-symbol change%, deliberately spanning both signs and a range of
 * magnitudes: `MoversBoard` ranks and colours by this, and `MoversRow`'s pct
 * pill tints from it too — an all-positive (or all-uniform) roster would
 * only ever exercise one visual branch of each. (The prototype rolls these
 * randomly per load; a golden needs them pinned.) */
const CHANGE_PCT: Readonly<Record<string, number>> = {
  AAPL: 1.35,
  NVDA: 3.12,
  TSLA: -1.24,
  MSFT: 0.46,
  AMZN: -0.62,
  META: 2.05,
  GOOGL: -0.38,
  NFLX: 1.72,
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
const QUOTES: Readonly<Record<string, EquityQuote>> = Object.fromEntries(
  WATCHLIST.map((inst) => {
    return [
      inst.symbol,
      buildQuote(
        inst.symbol,
        LAST_PRICE[inst.symbol] as number,
        CHANGE_PCT[inst.symbol] as number,
      ),
    ];
  }),
);

/** Candles per symbol — matches `EquityMarketDataSimulator`'s own "1D"
 * bucket count (one-minute buckets), so both `RowSparkline` (movers row) and
 * `CandleChart` (trade view) get a series that reads as a real chart, not a
 * two-point stub. */
const CANDLE_COUNT = 60;

/** Deterministic PRNG (mulberry32) — a pure function of its seed, NOT
 * `Math.random`: same output on every call, no entropy source, matching the
 * same "pure function of its arguments" exemption `pinnedClock.ts` documents
 * for `Date.UTC`. It exists because the previous builder drew its drift from
 * `Math.sin` of the bucket index, and a sine reads as a smooth synthetic
 * wave next to the design prototype's noisy random walks — visibly fake in
 * the `equities/markets` sparklines. A seeded walk keeps the determinism a
 * golden needs while looking like market data. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;

  return (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded random walk pinned to end at `basePrice`: closes are generated
 * newest-first (`closes[last] === basePrice`, each older close derived by
 * un-applying a ±0.3% step), so the chart still plausibly meets the quoted
 * last price. Step and wick scales mirror the design prototype's own candle
 * seeder (±0.6% bodies, ≤0.2% wicks). `seed` gives each symbol its own
 * walk so the eight series don't move in lockstep. */
function buildCandles(basePrice: number, seed: number): readonly Candle[] {
  const rand = mulberry32(seed);

  const closes: number[] = new Array(CANDLE_COUNT);
  closes[CANDLE_COUNT - 1] = round2(basePrice);

  for (let i = CANDLE_COUNT - 2; i >= 0; i--) {
    const next = closes[i + 1] as number;
    closes[i] = round2(next / (1 + (rand() - 0.48) * 0.006));
  }

  const candles: Candle[] = [];

  for (let i = 0; i < CANDLE_COUNT; i++) {
    const time = PINNED_NOW_MS - (CANDLE_COUNT - 1 - i) * MINUTE_MS;
    const close = closes[i] as number;
    const open = i === 0 ? close : (closes[i - 1] as number);
    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);
    // Wicks are always >= 1 cent, so after rounding `high` is strictly
    // greater than `bodyHigh` and `low` strictly less than `bodyLow` — the
    // OHLC invariant (`low <= min(open,close) && max(open,close) <= high`)
    // holds by construction, not by luck of the rounding.
    const high = round2(bodyHigh + rand() * basePrice * 0.002 + 0.01);
    const low = round2(bodyLow - (rand() * basePrice * 0.002 + 0.01));
    const volume = 500_000 + Math.round(rand() * 400_000);

    candles.push({ time, open, high, low, close, volume });
  }

  return candles;
}

const CANDLES: Readonly<Record<string, readonly Candle[]>> = Object.fromEntries(
  WATCHLIST.map((inst, i) => {
    return [
      inst.symbol,
      buildCandles(LAST_PRICE[inst.symbol] as number, 11 + i * 12),
    ];
  }),
);

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

const DEPTH: Readonly<Record<string, DepthBook>> = Object.fromEntries(
  WATCHLIST.map((inst, i) => {
    return [
      inst.symbol,
      buildDepth(inst.symbol, LAST_PRICE[inst.symbol] as number, 11 + i * 12),
    ];
  }),
);

/** `equities/blotter` used to mount `OrdersBlotter`/`PositionsBlotter` with
 * both feeds empty — an empty-state golden that asserts almost nothing about
 * either table. Seeding a few rows here means that scenario's golden will
 * capture a populated blotter instead once recaptured; that is an intended
 * change, not a regression, and both tables' populated render paths are now
 * exercised by the pixel tier. Spans more than one `OrderStatus` (filled /
 * working / partiallyFilled) and both `OrderSide`s. The three FILLED rows
 * are the design prototype's `eqOrders` verbatim (ids 885-887); the last two
 * exist so the non-terminal status arms keep pixel coverage — the prototype's
 * own blotter shows only fills. */
const ORDERS: readonly EquityOrder[] = [
  {
    id: "ord-887",
    symbol: "AAPL",
    side: "buy",
    type: "limit",
    qty: 400,
    limitPrice: 224.1,
    status: "filled",
    filledQty: 400,
    avgPrice: 224.1,
    createdAt: PINNED_NOW_MS - 5 * MINUTE_MS,
  },
  {
    id: "ord-886",
    symbol: "TSLA",
    side: "sell",
    type: "market",
    qty: 300,
    status: "filled",
    filledQty: 300,
    avgPrice: 252.0,
    createdAt: PINNED_NOW_MS - 24 * MINUTE_MS,
  },
  {
    id: "ord-885",
    symbol: "NVDA",
    side: "buy",
    type: "limit",
    qty: 1200,
    limitPrice: 118.4,
    status: "filled",
    filledQty: 1200,
    avgPrice: 118.4,
    createdAt: PINNED_NOW_MS - 108 * MINUTE_MS,
  },
  {
    id: "ord-884",
    symbol: "MSFT",
    side: "sell",
    type: "limit",
    qty: 50,
    limitPrice: 445,
    status: "working",
    filledQty: 0,
    createdAt: PINNED_NOW_MS - 130 * MINUTE_MS,
  },
  {
    id: "ord-883",
    symbol: "META",
    side: "buy",
    type: "limit",
    qty: 75,
    limitPrice: 510,
    status: "partiallyFilled",
    filledQty: 30,
    avgPrice: 509.8,
    createdAt: PINNED_NOW_MS - 150 * MINUTE_MS,
  },
];

/** The design prototype's `eqPos` — three open positions including a SHORT
 * (TSLA −300, its own render path), marked at `LAST_PRICE`. The prototype's
 * book is all-profit at these marks, so the losing-row tint keeps coverage
 * from the unit tier rather than this golden. */
const POSITIONS: readonly EquityPosition[] = [
  {
    symbol: "AAPL",
    qty: 400,
    avgPrice: 224.1,
    markPrice: 227.4,
    unrealisedPnl: 1320,
  },
  {
    symbol: "NVDA",
    qty: 1200,
    avgPrice: 118.4,
    markPrice: 131.2,
    unrealisedPnl: 15360,
  },
  {
    symbol: "TSLA",
    qty: -300,
    avgPrice: 252.0,
    markPrice: 248.9,
    unrealisedPnl: 930,
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
  // Pinned in the state the design's TRADE panel shows — BUY, LMT, the 500
  // chip lit, the limit stepper seeded from the last price (no limitPrice
  // set). Production starts at qty 0 / MKT; the golden holds the busier
  // frame so every ticket row is in it.
  useOrderTicket: (defaultSymbol: string) => {
    return {
      state: {
        phase: "editing" as const,
        form: {
          symbol: defaultSymbol,
          side: "buy" as const,
          type: "limit" as const,
          qty: 500,
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
