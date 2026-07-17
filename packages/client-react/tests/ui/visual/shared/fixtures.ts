import type {
  ActivityEntry,
  EqWorkspaceState,
  NotionalView,
  OrderTicketState,
  RfqQuote,
} from "@rtc/client-core";
import {
  ADAPTIVE_BANK_NAME,
  type Candle,
  ConnectionStatus,
  type CurrencyPair,
  type Dealer,
  type DepthBook,
  Direction,
  type EquityInstrument,
  type EquityOrder,
  type EquityPosition,
  type EquityQuote,
  ExecutionStatus,
  type Instrument,
  type LogEvent,
  type MetricSample,
  type PositionUpdates,
  type Price,
  PriceMovementType,
  type PriceTick,
  type Quote,
  RFQ_THRESHOLD,
  RFQ_TIMEOUT_MS,
  type Rfq,
  RfqState,
  type ServiceTopology,
  type SessionInfo,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import { type AppData, makeAppData } from "./appData";

const eurusd: CurrencyPair = {
  symbol: "EURUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "EUR",
  terms: "USD",
  defaultNotional: 1_000_000,
  baseMid: 1.09213,
  typicalSpreadPips: 1.4,
};

const eurusdPrice: Price = {
  symbol: "EURUSD",
  bid: 1.09213,
  ask: 1.09227,
  mid: 1.0922,
  valueDate: "2026-06-08",
  creationTimestamp: 1_750_000_000_000,
  movementType: PriceMovementType.UP,
  spread: "1.4",
};

const analyticsData: PositionUpdates = {
  currentPositions: [
    {
      symbol: "EURUSD",
      basePnl: 12500,
      baseTradedAmount: 3_000_000,
      counterTradedAmount: -3_276_600,
    },
    {
      symbol: "USDJPY",
      basePnl: -4200,
      baseTradedAmount: -1_000_000,
      counterTradedAmount: 151_200_000,
    },
    {
      symbol: "GBPUSD",
      basePnl: 8800,
      baseTradedAmount: 2_000_000,
      counterTradedAmount: -2_534_000,
    },
  ],
  history: [
    { timestamp: "2026-06-06T09:00:00Z", usdPnl: 0 },
    { timestamp: "2026-06-06T10:00:00Z", usdPnl: 5400 },
    { timestamp: "2026-06-06T11:00:00Z", usdPnl: 3100 },
    { timestamp: "2026-06-06T12:00:00Z", usdPnl: 9200 },
    { timestamp: "2026-06-06T13:00:00Z", usdPnl: 17100 },
  ],
};

const gbpusd: CurrencyPair = {
  symbol: "GBPUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "GBP",
  terms: "USD",
  defaultNotional: 1_000_000,
  baseMid: 1.26414,
  typicalSpreadPips: 1.8,
};
const usdjpy: CurrencyPair = {
  symbol: "USDJPY",
  ratePrecision: 3,
  pipsPosition: 2,
  base: "USD",
  terms: "JPY",
  defaultNotional: 1_000_000,
  baseMid: 151.203,
  typicalSpreadPips: 1.6,
};
const gbpusdPrice: Price = {
  symbol: "GBPUSD",
  bid: 1.2641,
  ask: 1.26428,
  mid: 1.26419,
  valueDate: "2026-06-08",
  creationTimestamp: 1_750_000_000_000,
  movementType: PriceMovementType.DOWN,
  spread: "1.8",
};
const usdjpyPrice: Price = {
  symbol: "USDJPY",
  bid: 151.203,
  ask: 151.219,
  mid: 151.211,
  valueDate: "2026-06-08",
  creationTimestamp: 1_750_000_000_000,
  movementType: PriceMovementType.UP,
  spread: "1.6",
};

// TilePrice colour arms: DOWN (red pip) and NONE (no movement colour). Same
// EURUSD pair so only the movementType differs from the existing -up shot.
const eurusdPriceDown: Price = {
  ...eurusdPrice,
  movementType: PriceMovementType.DOWN,
};
const eurusdPriceFlat: Price = {
  ...eurusdPrice,
  movementType: PriceMovementType.NONE,
};

// TileChart arms: a >=2-point descending series draws the red (down) sparkline;
// a single-point series exercises the empty-path (history.length < 2) arm.
const eurusdHistoryDown: readonly PriceTick[] = [
  {
    symbol: "EURUSD",
    bid: 1.0935,
    ask: 1.0937,
    mid: 1.0936,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_000_000,
  },
  {
    symbol: "EURUSD",
    bid: 1.0931,
    ask: 1.0933,
    mid: 1.0932,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_001_000,
  },
  {
    symbol: "EURUSD",
    bid: 1.0927,
    ask: 1.0929,
    mid: 1.0928,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_002_000,
  },
  {
    symbol: "EURUSD",
    bid: 1.0922,
    ask: 1.0924,
    mid: 1.0923,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_003_000,
  },
];
const eurusdHistoryEmpty: readonly PriceTick[] = [
  {
    symbol: "EURUSD",
    bid: 1.0921,
    ask: 1.0923,
    mid: 1.0922,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_000_000,
  },
];
// Ascending series: last mid > prev mid → the green (isUp true) sparkline arm.
const eurusdHistoryUp: readonly PriceTick[] = [
  {
    symbol: "EURUSD",
    bid: 1.0921,
    ask: 1.0923,
    mid: 1.0922,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_000_000,
  },
  {
    symbol: "EURUSD",
    bid: 1.0925,
    ask: 1.0927,
    mid: 1.0926,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_001_000,
  },
  {
    symbol: "EURUSD",
    bid: 1.093,
    ask: 1.0932,
    mid: 1.0931,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_002_000,
  },
  {
    symbol: "EURUSD",
    bid: 1.0936,
    ask: 1.0938,
    mid: 1.0937,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_003_000,
  },
];
// All-equal mids (>=2 points): range collapses to 0 → the `max - min || 1`
// fallback arm; renders a flat horizontal sparkline.
const eurusdHistoryFlat: readonly PriceTick[] = [
  {
    symbol: "EURUSD",
    bid: 1.0921,
    ask: 1.0923,
    mid: 1.0922,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_000_000,
  },
  {
    symbol: "EURUSD",
    bid: 1.0921,
    ask: 1.0923,
    mid: 1.0922,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_001_000,
  },
  {
    symbol: "EURUSD",
    bid: 1.0921,
    ask: 1.0923,
    mid: 1.0922,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_002_000,
  },
];

// Watchlist Trend column arms: a descending GBPUSD series (red sparkline) and
// a flat USDJPY series (horizontal sparkline) — paired with eurusdHistoryUp
// (green) so watchlist/populated exercises all three Trend directions at once.
const gbpusdHistoryDown: readonly PriceTick[] = [
  {
    symbol: "GBPUSD",
    bid: 1.2652,
    ask: 1.2654,
    mid: 1.2653,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_000_000,
  },
  {
    symbol: "GBPUSD",
    bid: 1.2646,
    ask: 1.2648,
    mid: 1.2647,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_001_000,
  },
  {
    symbol: "GBPUSD",
    bid: 1.264,
    ask: 1.2642,
    mid: 1.2641,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_002_000,
  },
];
const usdjpyHistoryFlat: readonly PriceTick[] = [
  {
    symbol: "USDJPY",
    bid: 151.203,
    ask: 151.219,
    mid: 151.211,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_000_000,
  },
  {
    symbol: "USDJPY",
    bid: 151.203,
    ask: 151.219,
    mid: 151.211,
    valueDate: "2026-06-08",
    creationTimestamp: 1_750_000_001_000,
  },
];

// Analytics arms: negative latest PnL + a negative current position (PnlValue /
// PnlChart negative colour arms); an empty panel (no positions, no history);
// and all-flat positions (PairPnlBars maxAbsPnl === 0 degenerate arm; the
// PositionsPanel net-exposure bubbles are exercised separately by positions/*).
const analyticsNegative: PositionUpdates = {
  currentPositions: [
    {
      symbol: "EURUSD",
      basePnl: -9300,
      baseTradedAmount: -2_000_000,
      counterTradedAmount: 2_184_400,
    },
    {
      symbol: "USDJPY",
      basePnl: -4200,
      baseTradedAmount: -1_000_000,
      counterTradedAmount: 151_200_000,
    },
  ],
  history: [
    { timestamp: "2026-06-06T09:00:00Z", usdPnl: 0 },
    { timestamp: "2026-06-06T10:00:00Z", usdPnl: -3200 },
    { timestamp: "2026-06-06T11:00:00Z", usdPnl: -7600 },
    { timestamp: "2026-06-06T12:00:00Z", usdPnl: -13500 },
  ],
};
const analyticsEmpty: PositionUpdates = { currentPositions: [], history: [] };
// Million-scale, all-positive analytics: the last history point >= 1m drives the
// PnlValue "m" format arm ("+1.25m"); a position basePnl >= 1m drives the
// PairPnlBars "m" label arm; and because every history value is > 0 (no zero
// crossing) PnlChart's zero-line is suppressed (the `min > 0` return-null arm).
const analyticsMillions: PositionUpdates = {
  currentPositions: [
    {
      symbol: "EURUSD",
      basePnl: 1_450_000,
      baseTradedAmount: 90_000_000,
      counterTradedAmount: -98_000_000,
    },
    {
      symbol: "USDJPY",
      basePnl: 320_000,
      baseTradedAmount: 40_000_000,
      counterTradedAmount: 6_000_000_000,
    },
  ],
  history: [
    { timestamp: "2026-06-06T09:00:00Z", usdPnl: 200_000 },
    { timestamp: "2026-06-06T10:00:00Z", usdPnl: 640_000 },
    { timestamp: "2026-06-06T11:00:00Z", usdPnl: 980_000 },
    { timestamp: "2026-06-06T12:00:00Z", usdPnl: 1_250_000 },
  ],
};
const analyticsFlat: PositionUpdates = {
  currentPositions: [
    {
      symbol: "EURUSD",
      basePnl: 0,
      baseTradedAmount: 0,
      counterTradedAmount: 0,
    },
    {
      symbol: "USDJPY",
      basePnl: 0,
      baseTradedAmount: 0,
      counterTradedAmount: 0,
    },
    {
      symbol: "GBPUSD",
      basePnl: 0,
      baseTradedAmount: 0,
      counterTradedAmount: 0,
    },
  ],
  history: [
    { timestamp: "2026-06-06T09:00:00Z", usdPnl: 0 },
    { timestamp: "2026-06-06T10:00:00Z", usdPnl: 0 },
  ],
};
// PositionsPanel "USD dominates negative" arm: two positions both short USD
// (long EUR / long GBP against it) so netExposureByCurrency nets USD to the
// largest-magnitude negative bubble, with EUR/GBP as smaller positive ones.
const positionsNegative: PositionUpdates = {
  currentPositions: [
    {
      symbol: "EURUSD",
      basePnl: 6100,
      baseTradedAmount: 5_000_000,
      counterTradedAmount: -5_461_000,
    },
    {
      symbol: "GBPUSD",
      basePnl: -2900,
      baseTradedAmount: 3_000_000,
      counterTradedAmount: -3_792_570,
    },
  ],
  history: [
    { timestamp: "2026-06-06T09:00:00Z", usdPnl: 0 },
    { timestamp: "2026-06-06T10:00:00Z", usdPnl: 3200 },
  ],
};

// FX blotter trades — static, deterministic rows for BlotterRow + filters.
const fxTrades: readonly Trade[] = [
  {
    tradeId: 4001,
    tradeName: "Trade 4001",
    currencyPair: "EURUSD",
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.09221,
    status: TradeStatus.Done,
    tradeDate: "2026-06-06",
    valueDate: "2026-06-08",
  },
  {
    tradeId: 4002,
    tradeName: "Trade 4002",
    currencyPair: "USDJPY",
    notional: 5_000_000,
    dealtCurrency: "USD",
    direction: Direction.Sell,
    spotRate: 151.211,
    status: TradeStatus.Done,
    tradeDate: "2026-06-05",
    valueDate: "2026-06-07",
  },
  {
    tradeId: 4003,
    tradeName: "Trade 4003",
    currencyPair: "GBPUSD",
    notional: 2_500_000,
    dealtCurrency: "GBP",
    direction: Direction.Buy,
    spotRate: 1.26419,
    status: TradeStatus.Rejected,
    tradeDate: "2026-06-05",
    valueDate: "2026-06-07",
  },
];

// FX blotter Activity feed — live-executed entries (tradeName "You"), newest
// first. One TRADE and one REJECT so both badge/description color arms
// appear in a single shot.
const fxActivity: readonly ActivityEntry[] = [
  {
    trade: {
      tradeId: 1044,
      tradeName: "You",
      currencyPair: "GBPJPY",
      notional: 750_000,
      dealtCurrency: "GBP",
      direction: Direction.Buy,
      spotRate: 190.442,
      status: TradeStatus.Rejected,
      tradeDate: "2026-07-06",
      valueDate: "2026-07-08",
    },
    time: "09:31:40",
  },
  {
    trade: {
      tradeId: 1043,
      tradeName: "You",
      currencyPair: "EURUSD",
      notional: 1_000_000,
      dealtCurrency: "EUR",
      direction: Direction.Sell,
      spotRate: 1.09205,
      status: TradeStatus.Done,
      tradeDate: "2026-07-06",
      valueDate: "2026-07-08",
    },
    time: "09:30:15",
  },
];

// Credit fixture — instrument/dealer/rfq/quote ids are cross-linked:
//   RfqsPanel (default "Live" filter) needs an Open rfq + its quotes;
//   CreditBlotter needs a Closed rfq with an accepted quote in allQuotes;
//   SellSidePanel needs a quote from the "Adaptive Bank" dealer.
const creditInstruments: readonly Instrument[] = [
  {
    id: 1,
    name: "US Treasury 10Y",
    cusip: "912828ZQ6",
    ticker: "T 1.5 02/34",
    maturity: "2034-02-15",
    interestRate: 1.5,
    benchmark: "10Y",
    refPrice: 98.4,
  },
  {
    id: 2,
    name: "Apple Inc 2030",
    cusip: "037833EK8",
    ticker: "AAPL 2.4 30",
    maturity: "2030-05-11",
    interestRate: 2.4,
    benchmark: "7Y",
    refPrice: 99.8,
  },
];
const creditDealers: readonly Dealer[] = [
  { id: 1, name: ADAPTIVE_BANK_NAME },
  { id: 2, name: "Citi" },
  { id: 3, name: "JP Morgan" },
  { id: 4, name: "Goldman Sachs" },
];
const creditRfqs: readonly Rfq[] = [
  {
    id: 101,
    instrumentId: 1,
    quantity: 5_000_000,
    direction: Direction.Buy,
    state: RfqState.Open,
    expirySecs: 120,
    creationTimestamp: 1_750_000_300_000,
  },
  {
    id: 102,
    instrumentId: 2,
    quantity: 2_000_000,
    direction: Direction.Sell,
    state: RfqState.Closed,
    expirySecs: 120,
    creationTimestamp: 1_750_000_200_000,
  },
];
const creditQuotes101: readonly Quote[] = [
  {
    id: 1001,
    rfqId: 101,
    dealerId: 1,
    state: { type: "pendingWithPrice", price: 98.45 },
  },
  {
    id: 1002,
    rfqId: 101,
    dealerId: 2,
    state: { type: "pendingWithPrice", price: 98.5 },
  },
  { id: 1003, rfqId: 101, dealerId: 3, state: { type: "pendingWithoutPrice" } },
];
const creditQuotes102: readonly Quote[] = [
  {
    id: 2001,
    rfqId: 102,
    dealerId: 2,
    state: { type: "accepted", price: 101.2 },
  },
];
const creditAllQuotes: ReadonlyMap<number, Quote> = new Map(
  [...creditQuotes101, ...creditQuotes102].map((q) => {
    return [q.id, q];
  }),
);

// Task 6 dock scenarios — RfqsPanel/RfqCard/NewRfqPanel replace the old
// rfqTiles/NewRfqForm goldens Task 4 deleted; these fixtures cover the same
// per-state arms (live/accepted/terminated cards, passed/rejected quote
// colours, the empty panel, and the New RFQ form's confirmed arm) against the
// new components.
// A terminated (Cancelled) card for the RfqsPanel "closed" filter arm.
const creditTerminatedRfq: Rfq = {
  id: 103,
  instrumentId: 1,
  quantity: 3_000_000,
  direction: Direction.Sell,
  state: RfqState.Cancelled,
  expirySecs: 120,
  creationTimestamp: 1_750_000_100_000,
};
const creditTerminatedQuote: Quote = {
  id: 3001,
  rfqId: 103,
  dealerId: 3,
  state: { type: "passed" },
};

// Standalone RfqCard states not otherwise reached by a panel-filter arm:
// a still-live card with a passed quote (QuoteRow "passed" colour, no ACCEPT),
// a still-live card with a rejectedWithPrice quote ("Rejected" text + colour),
// and an Expired (terminated, EXPIRED label) card distinct from the Cancelled
// one above.
const creditCardPassedRfq: Rfq = {
  id: 111,
  instrumentId: 1,
  quantity: 4_000_000,
  direction: Direction.Buy,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
const creditCardPassedQuote: Quote = {
  id: 1101,
  rfqId: 111,
  dealerId: 2,
  state: { type: "passed" },
};
const creditCardRejectedRfq: Rfq = {
  id: 112,
  instrumentId: 2,
  quantity: 1_500_000,
  direction: Direction.Sell,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
const creditCardRejectedQuote: Quote = {
  id: 1102,
  rfqId: 112,
  dealerId: 3,
  state: { type: "rejectedWithPrice", price: 97.1 },
};
const creditCardExpiredRfq: Rfq = {
  id: 113,
  instrumentId: 1,
  quantity: 2_500_000,
  direction: Direction.Buy,
  state: RfqState.Expired,
  expirySecs: 120,
  creationTimestamp: 1_750_000_100_000,
};
const creditCardExpiredQuote: Quote = {
  id: 1103,
  rfqId: 113,
  dealerId: 4,
  state: { type: "rejectedWithoutPrice" },
};

// CreditBlotter degraded-data row: a Closed rfq with an accepted quote whose
// instrumentId (777) and dealerId (888) resolve to nothing in the maps, so the
// row renders the `?? "Dealer 888"` / `?? ""` (empty CUSIP/Security) fallbacks.
const creditBlotterUnresolvedRfq: Rfq = {
  id: 401,
  instrumentId: 777,
  quantity: 2_000_000,
  direction: Direction.Sell,
  state: RfqState.Closed,
  expirySecs: 120,
  creationTimestamp: 1_750_000_200_000,
};
const creditBlotterUnresolvedQuote: Quote = {
  id: 5001,
  rfqId: 401,
  dealerId: 888,
  state: { type: "accepted", price: 100.5 },
};

// Sell-side: an Open RFQ where Adaptive Bank's quote is pendingWithoutPrice
// drives the active (price-entry) ticket; a passed quote drives the responded
// arm. Both need a dealer named ADAPTIVE_BANK_NAME (creditDealers id 1).
const sellSideActiveRfq: Rfq = {
  id: 301,
  instrumentId: 1,
  quantity: 5_000_000,
  direction: Direction.Buy,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
const sellSideActiveQuotes: readonly Quote[] = [
  { id: 4001, rfqId: 301, dealerId: 1, state: { type: "pendingWithoutPrice" } },
];
const sellSideRespondedRfq: Rfq = {
  id: 302,
  instrumentId: 2,
  quantity: 2_000_000,
  direction: Direction.Sell,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
const sellSideRespondedQuotes: readonly Quote[] = [
  {
    id: 4101,
    rfqId: 302,
    dealerId: 1,
    state: { type: "pendingWithPrice", price: 101.25 },
  },
];

// One Adaptive-Bank ticket per fixture for the remaining TradeTicket render
// arms. Each pairs an Rfq (whose state drives the opacity + the else-arm /
// "RFQ …" labels) with the AB dealer's (id 1) quote (whose state.type drives
// the responded-view ternary). Helper builds the AppData the SellSidePanel
// reads (rfqs + the per-rfq quote map + allQuotes).
function sellSideTicketFixture(
  rfq: Rfq,
  quoteState: Quote["state"],
  instruments: readonly Instrument[] = creditInstruments,
): AppData {
  const quote: Quote = {
    id: rfq.id * 10 + 1,
    rfqId: rfq.id,
    dealerId: 1,
    state: quoteState,
  };
  return makeAppData({
    instruments,
    dealers: creditDealers,
    rfqs: [rfq],
    quotesForRfq: { [rfq.id]: [quote] },
    allQuotes: new Map([[quote.id, quote]]),
  });
}

// Responded-view ternary arms (rendered when the AB quote has responded):
//   passed quote (Open rfq) → "Passed"
const sellSidePassedRfq: Rfq = {
  id: 311,
  instrumentId: 1,
  quantity: 5_000_000,
  direction: Direction.Buy,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
//   responded quote on a Cancelled rfq → "RFQ Cancelled" (also opacity 0.6)
const sellSideRfqCancelledRfq: Rfq = {
  id: 312,
  instrumentId: 2,
  quantity: 2_000_000,
  direction: Direction.Sell,
  state: RfqState.Cancelled,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
//   responded quote on an Expired rfq → "RFQ Expired"
const sellSideRfqExpiredRfq: Rfq = {
  id: 313,
  instrumentId: 1,
  quantity: 3_000_000,
  direction: Direction.Buy,
  state: RfqState.Expired,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
//   responded (accepted) quote on an Open rfq → the "Responded" fallback
const sellSideRespondedFallbackRfq: Rfq = {
  id: 314,
  instrumentId: 2,
  quantity: 4_000_000,
  direction: Direction.Sell,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
// Else-arm labels (AB quote still pendingWithoutPrice, rfq no longer Open):
//   Closed / Cancelled / Expired rfq → "Closed" / "Cancelled" / "Expired"
const sellSideClosedRfq: Rfq = {
  id: 315,
  instrumentId: 1,
  quantity: 5_000_000,
  direction: Direction.Buy,
  state: RfqState.Closed,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
const sellSideCancelledPendingRfq: Rfq = {
  id: 316,
  instrumentId: 2,
  quantity: 2_000_000,
  direction: Direction.Sell,
  state: RfqState.Cancelled,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
const sellSideExpiredPendingRfq: Rfq = {
  id: 317,
  instrumentId: 1,
  quantity: 1_500_000,
  direction: Direction.Buy,
  state: RfqState.Expired,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
// Instrument-name fallback: instrumentId 999 has no matching instrument →
// the "Instrument #999" branch (rendered with an active price-entry ticket).
const sellSideNoInstrumentRfq: Rfq = {
  id: 318,
  instrumentId: 999,
  quantity: 6_000_000,
  direction: Direction.Buy,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};

// --- Phase 9: tile execution / RFQ / stale states injected per-symbol ---
// Previously timer-driven and excluded; now the app-layer machine state is
// injectable through the seam, so each arm is a deterministic static snapshot.

// A base EURUSD tile (price present so the tile body renders). Execution and
// stale arms reuse it; RFQ arms additionally flip notional to the RFQ layout.
const eurusdTileBase: Partial<AppData> = {
  currencyPairs: [eurusd],
  prices: { EURUSD: eurusdPrice },
};

// The Done arm needs a representative completed Trade for the confirmation card.
const eurusdDoneTrade: Trade = {
  tradeId: 4242,
  tradeName: "Trade 4242",
  currencyPair: "EURUSD",
  notional: 1_000_000,
  dealtCurrency: "EUR",
  direction: Direction.Buy,
  spotRate: 1.09227,
  status: TradeStatus.Done,
  tradeDate: "2026-06-08",
  valueDate: "2026-06-10",
};
// A Sell-direction completed Trade → the TileConfirmation "You Sold" verb arm
// (the Buy trade above renders "You Bought").
const eurusdDoneTradeSell: Trade = {
  ...eurusdDoneTrade,
  tradeId: 4243,
  tradeName: "Trade 4243",
  direction: Direction.Sell,
  dealtCurrency: "EUR",
};

// TileNotional error arm: an invalid notional draft drives the
// `state.error ? "var(--accent-negative)"` underline + the error <span>.
const erroredNotional: NotionalView = {
  displayValue: "abc",
  numericValue: NaN,
  error: "Invalid notional",
  isRfq: false,
  isDefault: false,
};

// RFQ-active layout: a notional at/above RFQ_THRESHOLD flips the tile to the
// TileRfq body (Tile only renders TileRfq when notional.state.isRfq is true).
const rfqNotional: NotionalView = {
  displayValue: RFQ_THRESHOLD.toLocaleString("en-US"),
  numericValue: RFQ_THRESHOLD,
  error: null,
  isRfq: true,
  isDefault: false,
};

// A received quote built from the EURUSD price. totalMs = RFQ_TIMEOUT_MS so the
// countdown fraction is remainingMs / RFQ_TIMEOUT_MS.
const eurusdQuote: RfqQuote = {
  bid: eurusdPrice.bid,
  ask: eurusdPrice.ask,
  timeoutMs: RFQ_TIMEOUT_MS,
};

export const fixtures: Record<string, AppData> = {
  "connection-connected": makeAppData({
    connectionStatus: ConnectionStatus.CONNECTED,
  }),
  "connection-disconnected": makeAppData({
    connectionStatus: ConnectionStatus.DISCONNECTED,
  }),
  "tile-eurusd-up": makeAppData({
    currencyPairs: [eurusd],
    prices: { EURUSD: eurusdPrice },
  }),
  "tile-loading": makeAppData({
    currencyPairs: [eurusd],
    prices: { EURUSD: null },
  }),
  "analytics-populated": makeAppData({ analytics: analyticsData }),
  "analytics-loading": makeAppData({ analytics: null }),
  "connection-offline": makeAppData({
    connectionStatus: ConnectionStatus.OFFLINE_DISCONNECTED,
  }),
  "connection-idle": makeAppData({
    connectionStatus: ConnectionStatus.IDLE_DISCONNECTED,
  }),
  "live-rates-populated": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
  }),
  // Same data as live-rates-populated but seeded into price view through the
  // seam (viewMode "price"). The view mode now lives behind PreferencesPort, so
  // the price-mode arm is reached by seeding state, not by a runtime toggle —
  // the rendered output (tile charts suppressed) is identical. The CHARTS
  // toggle itself now lives in LiveRatesHead, outside this panel.
  "live-rates-price": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
    viewMode: "price",
  }),
  // Watchlist table: three pairs covering all three Trend directions — EURUSD
  // up (green), GBPUSD down (red), USDJPY flat (horizontal).
  "watchlist-populated": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
    priceHistory: {
      EURUSD: eurusdHistoryUp,
      GBPUSD: gbpusdHistoryDown,
      USDJPY: usdjpyHistoryFlat,
    },
  }),
  "app-fx": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
    analytics: analyticsData,
    connectionStatus: ConnectionStatus.CONNECTED,
    // Admin tab throughput: a loaded value of 250 (was the old fetch-stub value),
    // so the AdminPanel slider/input render deterministically through the seam.
    throughput: { value: 250, loading: false, message: null },
  }),
  // Power-saver variant of the FX page: same data as app-fx, but with the
  // power-saver master override on. The seam-fed usePowerSaver fake flips
  // enabled to true, which the real App wiring uses to suppress the aurora
  // glow / drifting ambient-background layers — grid + vignette stay static.
  "app-fx-power-saver": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
    analytics: analyticsData,
    connectionStatus: ConnectionStatus.CONNECTED,
    throughput: { value: 250, loading: false, message: null },
    powerSaver: true,
  }),
  // Light-theme variant of the FX page. The theme now lives behind
  // PreferencesPort, so the light arm is reached by seeding theme mode "light"
  // rather than clicking the toggle — the rendered output is identical to the old
  // post-click state, and the ThemeToggle's aria-label reads "Switch to dark theme".
  "app-fx-light": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
    analytics: analyticsData,
    connectionStatus: ConnectionStatus.CONNECTED,
    throughput: { value: 250, loading: false, message: null },
    themeMode: "light",
  }),
  // System mode preference: the header toggle shows the third (🖥️) icon and its
  // aria-label reads "Switch to dark theme" (next in the cycle). With no OS media
  // query in the harness, "system" resolves to dark, so the page paints dark.
  "app-fx-system": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
    analytics: analyticsData,
    connectionStatus: ConnectionStatus.CONNECTED,
    throughput: { value: 250, loading: false, message: null },
    themeMode: "system",
  }),
  "fx-trades": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
    trades: fxTrades,
  }),
  "fx-activity-populated": makeAppData({
    activity: fxActivity,
  }),
  "credit-populated": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: creditRfqs,
    quotesForRfq: { 101: creditQuotes101, 102: creditQuotes102 },
    allQuotes: creditAllQuotes,
  }),
  // RfqsPanel "closed" filter arm: same populated world as credit-populated,
  // switched to CLOSED so only rfq 102 (Closed, accepted quote) renders — the
  // card's "accepted" data-state (✓ You traded with … footer).
  "credit-rfqs-closed": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: creditRfqs,
    quotesForRfq: { 101: creditQuotes101, 102: creditQuotes102 },
    allQuotes: creditAllQuotes,
    creditRfqFilter: "closed",
  }),
  // RfqsPanel terminated-card arm: a Cancelled rfq under the CLOSED filter →
  // the card's "terminated" data-state (🗑 CANCELLED · remove footer).
  "credit-rfqs-terminated": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [creditTerminatedRfq],
    quotesForRfq: { 103: [creditTerminatedQuote] },
    allQuotes: new Map([[creditTerminatedQuote.id, creditTerminatedQuote]]),
    creditRfqFilter: "closed",
  }),
  // RfqsPanel empty arm: no rfqs at all → EmptyRfqs under the default LIVE filter.
  "credit-rfqs-empty": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [],
  }),
  // Standalone RfqCard per-quote-state arms (still-live cards): passed and
  // rejectedWithPrice quote colours, neither reachable via a panel filter arm
  // alone (both rfqs stay Open/live).
  "credit-card-passed": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [creditCardPassedRfq],
    quotesForRfq: { 111: [creditCardPassedQuote] },
    allQuotes: new Map([[creditCardPassedQuote.id, creditCardPassedQuote]]),
  }),
  "credit-card-rejected": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [creditCardRejectedRfq],
    quotesForRfq: { 112: [creditCardRejectedQuote] },
    allQuotes: new Map([[creditCardRejectedQuote.id, creditCardRejectedQuote]]),
  }),
  // Standalone RfqCard terminated (Expired) arm — the EXPIRED label, distinct
  // from the Cancelled arm covered by credit-rfqs-terminated above.
  "credit-card-expired": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [creditCardExpiredRfq],
    quotesForRfq: { 113: [creditCardExpiredQuote] },
    allQuotes: new Map([[creditCardExpiredQuote.id, creditCardExpiredQuote]]),
  }),
  // NewRfqPanel confirmed arm (submission machine seeded via the seam — no
  // interaction needed): the "RFQ Created" inline confirmation card.
  "credit-new-rfq-confirmed": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqSubmission: { status: "confirmed", rfqId: 999 },
  }),
  // AdminPanel loading arm: throughput not yet loaded → "Loading throughput…".
  "admin-loading": makeAppData({
    throughput: { value: 0, loading: true, message: null },
  }),
  // AdminPanel message banner arms (the `{message && …}` block): a confirmation
  // (isError:false → accent-primary bg) and an error (isError:true → status-error).
  "admin-message": makeAppData({
    throughput: {
      value: 250,
      loading: false,
      message: { text: "Throughput updated", isError: false },
    },
  }),
  "admin-message-error": makeAppData({
    throughput: {
      value: 250,
      loading: false,
      message: { text: "Failed to update throughput", isError: true },
    },
  }),
  // FX tile colour / chart arms.
  "tile-eurusd-down": makeAppData({
    currencyPairs: [eurusd],
    prices: { EURUSD: eurusdPriceDown },
  }),
  "tile-eurusd-flat": makeAppData({
    currencyPairs: [eurusd],
    prices: { EURUSD: eurusdPriceFlat },
  }),
  "tile-chart-down": makeAppData({
    currencyPairs: [eurusd],
    prices: { EURUSD: eurusdPrice },
    priceHistory: { EURUSD: eurusdHistoryDown },
  }),
  "tile-chart-empty": makeAppData({
    currencyPairs: [eurusd],
    prices: { EURUSD: eurusdPrice },
    priceHistory: { EURUSD: eurusdHistoryEmpty },
  }),
  // TileChart up (green isUp arm) and flat (range `|| 1` fallback) arms.
  "tile-chart-up": makeAppData({
    currencyPairs: [eurusd],
    prices: { EURUSD: eurusdPrice },
    priceHistory: { EURUSD: eurusdHistoryUp },
  }),
  "tile-chart-flat": makeAppData({
    currencyPairs: [eurusd],
    prices: { EURUSD: eurusdPrice },
    priceHistory: { EURUSD: eurusdHistoryFlat },
  }),
  // FX analytics arms.
  "analytics-negative": makeAppData({ analytics: analyticsNegative }),
  "analytics-empty": makeAppData({ analytics: analyticsEmpty }),
  "analytics-flat": makeAppData({ analytics: analyticsFlat }),
  // Million-scale, all-positive analytics: PnlValue/PairPnlBars "m" labels +
  // PnlChart no-zero-line arm.
  "analytics-millions": makeAppData({ analytics: analyticsMillions }),
  // PositionsPanel net-exposure bubble arm: USD is the dominant negative
  // currency (see positionsNegative above). populated/empty reuse the
  // existing analytics-populated/analytics-empty fixtures — both components
  // read the same PositionUpdates shape off useAnalytics().
  "positions-negative": makeAppData({ analytics: positionsNegative }),
  // SellSidePanel arms (need an Adaptive Bank quote per RFQ).
  "sell-side-active": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [sellSideActiveRfq],
    quotesForRfq: { 301: sellSideActiveQuotes },
    allQuotes: new Map(
      sellSideActiveQuotes.map((q) => {
        return [q.id, q];
      }),
    ),
  }),
  "sell-side-responded": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [sellSideRespondedRfq],
    quotesForRfq: { 302: sellSideRespondedQuotes },
    allQuotes: new Map(
      sellSideRespondedQuotes.map((q) => {
        return [q.id, q];
      }),
    ),
  }),
  // SellSidePanel empty arm: no rfqs => "No RFQs for Adaptive Bank".
  "sell-side-empty": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [],
  }),
  // TradeTicket remaining render arms (one Adaptive-Bank ticket each).
  "sell-side-passed": sellSideTicketFixture(sellSidePassedRfq, {
    type: "passed",
  }),
  "sell-side-rfq-cancelled": sellSideTicketFixture(sellSideRfqCancelledRfq, {
    type: "rejectedWithoutPrice",
  }),
  "sell-side-rfq-expired": sellSideTicketFixture(sellSideRfqExpiredRfq, {
    type: "rejectedWithPrice",
    price: 99.4,
  }),
  "sell-side-responded-fallback": sellSideTicketFixture(
    sellSideRespondedFallbackRfq,
    { type: "accepted", price: 100.2 },
  ),
  "sell-side-closed": sellSideTicketFixture(sellSideClosedRfq, {
    type: "pendingWithoutPrice",
  }),
  "sell-side-cancelled-pending": sellSideTicketFixture(
    sellSideCancelledPendingRfq,
    { type: "pendingWithoutPrice" },
  ),
  "sell-side-expired-pending": sellSideTicketFixture(
    sellSideExpiredPendingRfq,
    { type: "pendingWithoutPrice" },
  ),
  // Instrument-name fallback (no instrument matches rfq.instrumentId 999).
  "sell-side-no-instrument": sellSideTicketFixture(
    sellSideNoInstrumentRfq,
    { type: "pendingWithoutPrice" },
    [],
  ),
  // CreditBlotter empty arm: no Closed-with-accepted rfqs => "No credit trades yet".
  "credit-blotter-empty": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [],
  }),
  // CreditBlotter degraded row: accepted quote with unresolved dealer/instrument.
  "credit-blotter-unresolved": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [creditBlotterUnresolvedRfq],
    quotesForRfq: { 401: [creditBlotterUnresolvedQuote] },
    allQuotes: new Map([
      [creditBlotterUnresolvedQuote.id, creditBlotterUnresolvedQuote],
    ]),
  }),

  // --- Phase 9: tile execution confirmation arms (TileConfirmation overlay) ---
  "tile-exec-started": makeAppData({
    ...eurusdTileBase,
    tileExecution: { EURUSD: { status: "started" } },
  }),
  "tile-exec-too-long": makeAppData({
    ...eurusdTileBase,
    tileExecution: { EURUSD: { status: "tooLong" } },
  }),
  "tile-exec-timeout": makeAppData({
    ...eurusdTileBase,
    tileExecution: { EURUSD: { status: "timeout" } },
  }),
  "tile-exec-done": makeAppData({
    ...eurusdTileBase,
    tileExecution: {
      EURUSD: {
        status: "finished",
        executionStatus: ExecutionStatus.Done,
        trade: eurusdDoneTrade,
      },
    },
  }),
  // Done with a Sell trade → the TileConfirmation "You Sold" verb arm.
  "tile-exec-done-sell": makeAppData({
    ...eurusdTileBase,
    tileExecution: {
      EURUSD: {
        status: "finished",
        executionStatus: ExecutionStatus.Done,
        trade: eurusdDoneTradeSell,
      },
    },
  }),
  "tile-exec-rejected": makeAppData({
    ...eurusdTileBase,
    tileExecution: {
      EURUSD: { status: "finished", executionStatus: ExecutionStatus.Rejected },
    },
  }),
  "tile-exec-credit-exceeded": makeAppData({
    ...eurusdTileBase,
    tileExecution: {
      EURUSD: {
        status: "finished",
        executionStatus: ExecutionStatus.CreditExceeded,
      },
    },
  }),
  "tile-exec-finished-timeout": makeAppData({
    ...eurusdTileBase,
    tileExecution: {
      EURUSD: { status: "finished", executionStatus: ExecutionStatus.Timeout },
    },
  }),

  // TileNotional error arm (invalid notional draft): the accent-negative
  // underline + the error <span>.
  "tile-notional-error": makeAppData({
    ...eurusdTileBase,
    notional: erroredNotional,
  }),

  // --- Phase 9: RFQ tile arms (TileRfq body; notional flipped to RFQ layout) ---
  // init arm (no rfqTile entry → defaults to "init"): the "Initiate RFQ" button.
  "tile-rfq-init": makeAppData({ ...eurusdTileBase, notional: rfqNotional }),
  "tile-rfq-requested": makeAppData({
    ...eurusdTileBase,
    notional: rfqNotional,
    rfqTile: { EURUSD: { status: "requested", quote: null, remainingMs: 0 } },
  }),
  // received with ~70% remaining: countdown bar is in the green (fraction > 0.3) arm.
  "tile-rfq-received": makeAppData({
    ...eurusdTileBase,
    notional: rfqNotional,
    rfqTile: {
      EURUSD: { status: "received", quote: eurusdQuote, remainingMs: 7000 },
    },
  }),
  // received with 2000ms remaining: fraction 0.2 (< 0.3) → the amber low-time arm.
  "tile-rfq-received-low": makeAppData({
    ...eurusdTileBase,
    notional: rfqNotional,
    rfqTile: {
      EURUSD: { status: "received", quote: eurusdQuote, remainingMs: 2000 },
    },
  }),
  "tile-rfq-rejected": makeAppData({
    ...eurusdTileBase,
    notional: rfqNotional,
    rfqTile: { EURUSD: { status: "rejected", quote: null, remainingMs: 0 } },
  }),

  // --- Phase 9: stale "Reconnecting…" overlay arm ---
  "tile-stale": makeAppData({ ...eurusdTileBase, stale: { EURUSD: true } }),

  // --- Phase 2 HUD shell surfaces (boot / lock / chrome / status / prefs) ---
  // Header chrome + status bar render against a connected, unlocked session.
  "app-connected": makeAppData({
    connectionStatus: ConnectionStatus.CONNECTED,
  }),
  // Lock screen: the session is locked, so the full-screen overlay renders.
  "session-locked": makeAppData({ sessionLocked: true }),
  // Preferences modal: animated background off → its real switch reads "off".
  "prefs-open": makeAppData({ animatedBackground: false }),
  // Boot sequence: the deterministic chrome is captured under reduced motion
  // (the canvas art is animated and intentionally not pixel-golden'd — see the
  // shell visual specs). The default fake reports progress 0 / "core" variant.
  boot: makeAppData({}),
};

// ── Phase 4 Equities fixtures ──────────────────────────────────────────────
// All data is FIXED (no simulator) so every pixel is deterministic.

const equityInstruments: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ" },
  { symbol: "NVDA", name: "NVIDIA Corp.", exchange: "NASDAQ" },
  { symbol: "JPM", name: "JPMorgan Chase", exchange: "NYSE" },
  { symbol: "GS", name: "Goldman Sachs", exchange: "NYSE" },
  { symbol: "XOM", name: "ExxonMobil Corp.", exchange: "NYSE" },
];

const equityQuotes: Record<string, EquityQuote> = {
  AAPL: {
    symbol: "AAPL",
    bid: 178.4,
    ask: 178.6,
    last: 178.5,
    changePct: 3.45,
    timestamp: 1_750_000_000_000,
  },
  MSFT: {
    symbol: "MSFT",
    bid: 421.1,
    ask: 421.3,
    last: 421.2,
    changePct: 1.23,
    timestamp: 1_750_000_000_000,
  },
  NVDA: {
    symbol: "NVDA",
    bid: 875.2,
    ask: 875.8,
    last: 875.5,
    changePct: 7.21,
    timestamp: 1_750_000_000_000,
  },
  JPM: {
    symbol: "JPM",
    bid: 197.4,
    ask: 197.6,
    last: 197.5,
    changePct: -2.67,
    timestamp: 1_750_000_000_000,
  },
  GS: {
    symbol: "GS",
    bid: 462.8,
    ask: 463.2,
    last: 463.0,
    changePct: -0.88,
    timestamp: 1_750_000_000_000,
  },
  XOM: {
    symbol: "XOM",
    bid: 114.2,
    ask: 114.4,
    last: 114.3,
    changePct: 5.12,
    timestamp: 1_750_000_000_000,
  },
};

// 40 AAPL candles with clear up-down movement (GBM-like but hand-crafted).
// Starts around 165, climbs to ~180 with volatility, so the chart renders
// meaningfully with both green and red candles.
const aaplCandles: readonly Candle[] = [
  { time: 1_749_600_000, open: 165.0, high: 166.2, low: 164.5, close: 165.8 },
  { time: 1_749_603_600, open: 165.8, high: 167.1, low: 165.2, close: 166.9 },
  { time: 1_749_607_200, open: 166.9, high: 167.5, low: 165.8, close: 165.9 },
  { time: 1_749_610_800, open: 165.9, high: 166.8, low: 164.9, close: 164.9 },
  { time: 1_749_614_400, open: 164.9, high: 166.0, low: 164.2, close: 165.5 },
  { time: 1_749_618_000, open: 165.5, high: 168.0, low: 165.0, close: 167.8 },
  { time: 1_749_621_600, open: 167.8, high: 169.2, low: 167.1, close: 168.5 },
  { time: 1_749_625_200, open: 168.5, high: 169.8, low: 167.8, close: 169.1 },
  { time: 1_749_628_800, open: 169.1, high: 170.5, low: 168.6, close: 170.2 },
  { time: 1_749_632_400, open: 170.2, high: 171.0, low: 169.0, close: 169.4 },
  { time: 1_749_636_000, open: 169.4, high: 170.2, low: 168.5, close: 170.0 },
  { time: 1_749_639_600, open: 170.0, high: 171.5, low: 169.5, close: 171.2 },
  { time: 1_749_643_200, open: 171.2, high: 172.8, low: 170.8, close: 172.5 },
  { time: 1_749_646_800, open: 172.5, high: 173.4, low: 171.8, close: 172.0 },
  { time: 1_749_650_400, open: 172.0, high: 173.0, low: 171.0, close: 171.5 },
  { time: 1_749_654_000, open: 171.5, high: 172.5, low: 170.5, close: 172.2 },
  { time: 1_749_657_600, open: 172.2, high: 174.0, low: 172.0, close: 173.5 },
  { time: 1_749_661_200, open: 173.5, high: 175.2, low: 173.0, close: 174.8 },
  { time: 1_749_664_800, open: 174.8, high: 176.0, low: 174.2, close: 175.5 },
  { time: 1_749_668_400, open: 175.5, high: 176.5, low: 174.5, close: 174.8 },
  { time: 1_749_672_000, open: 174.8, high: 175.5, low: 173.5, close: 173.8 },
  { time: 1_749_675_600, open: 173.8, high: 174.8, low: 173.0, close: 174.5 },
  { time: 1_749_679_200, open: 174.5, high: 176.0, low: 174.2, close: 175.8 },
  { time: 1_749_682_800, open: 175.8, high: 177.2, low: 175.2, close: 176.8 },
  { time: 1_749_686_400, open: 176.8, high: 178.0, low: 176.0, close: 177.5 },
  { time: 1_749_690_000, open: 177.5, high: 178.5, low: 176.8, close: 178.0 },
  { time: 1_749_693_600, open: 178.0, high: 179.5, low: 177.5, close: 179.0 },
  { time: 1_749_697_200, open: 179.0, high: 180.2, low: 178.5, close: 179.8 },
  { time: 1_749_700_800, open: 179.8, high: 180.5, low: 178.8, close: 179.2 },
  { time: 1_749_704_400, open: 179.2, high: 180.0, low: 178.5, close: 178.8 },
  { time: 1_749_708_000, open: 178.8, high: 179.5, low: 178.0, close: 179.0 },
  { time: 1_749_711_600, open: 179.0, high: 179.8, low: 178.2, close: 178.5 },
  { time: 1_749_715_200, open: 178.5, high: 179.2, low: 177.8, close: 178.9 },
  { time: 1_749_718_800, open: 178.9, high: 180.1, low: 178.5, close: 179.8 },
  { time: 1_749_722_400, open: 179.8, high: 181.0, low: 179.2, close: 180.5 },
  { time: 1_749_726_000, open: 180.5, high: 181.5, low: 179.8, close: 180.0 },
  { time: 1_749_729_600, open: 180.0, high: 180.8, low: 179.2, close: 179.5 },
  { time: 1_749_733_200, open: 179.5, high: 180.2, low: 178.8, close: 179.2 },
  { time: 1_749_736_800, open: 179.2, high: 179.8, low: 178.4, close: 178.5 },
  { time: 1_749_740_400, open: 178.5, high: 179.0, low: 177.8, close: 178.5 },
];

const aaplDepthBook: DepthBook = {
  symbol: "AAPL",
  asks: [
    { price: 178.6, size: 1200 },
    { price: 178.8, size: 850 },
    { price: 179.0, size: 1500 },
    { price: 179.2, size: 600 },
    { price: 179.4, size: 950 },
    { price: 179.6, size: 1100 },
    { price: 179.8, size: 700 },
    { price: 180.0, size: 2000 },
  ],
  bids: [
    { price: 178.4, size: 900 },
    { price: 178.2, size: 1100 },
    { price: 178.0, size: 800 },
    { price: 177.8, size: 1400 },
    { price: 177.6, size: 650 },
    { price: 177.4, size: 1050 },
    { price: 177.2, size: 550 },
    { price: 177.0, size: 1800 },
  ],
};

const equityOrders: readonly EquityOrder[] = [
  {
    id: "ord-001",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 100,
    status: "filled",
    filledQty: 100,
    avgPrice: 178.5,
    createdAt: 1_750_000_000_000,
  },
  {
    id: "ord-002",
    symbol: "MSFT",
    side: "sell",
    type: "limit",
    qty: 50,
    limitPrice: 421.0,
    status: "working",
    filledQty: 0,
    createdAt: 1_750_000_001_000,
  },
  {
    id: "ord-003",
    symbol: "JPM",
    side: "buy",
    type: "market",
    qty: 200,
    status: "partiallyFilled",
    filledQty: 80,
    avgPrice: 197.5,
    createdAt: 1_750_000_002_000,
  },
  {
    id: "ord-004",
    symbol: "GS",
    side: "buy",
    type: "market",
    qty: 75,
    status: "rejected",
    filledQty: 0,
    createdAt: 1_750_000_003_000,
  },
  {
    id: "ord-005",
    symbol: "XOM",
    side: "sell",
    type: "market",
    qty: 150,
    status: "new",
    filledQty: 0,
    createdAt: 1_750_000_004_000,
  },
];

const equityPositions: readonly EquityPosition[] = [
  {
    symbol: "AAPL",
    qty: 500,
    avgPrice: 165.0,
    markPrice: 178.5,
    unrealisedPnl: 6750,
  },
  {
    symbol: "MSFT",
    qty: -100,
    avgPrice: 420.0,
    markPrice: 385.0,
    unrealisedPnl: 3500,
  },
  {
    symbol: "JPM",
    qty: 300,
    avgPrice: 199.0,
    markPrice: 197.5,
    unrealisedPnl: -450,
  },
  {
    symbol: "XOM",
    qty: 200,
    avgPrice: 108.0,
    markPrice: 114.3,
    unrealisedPnl: 1260,
  },
];

// Shared shape for equities base fixture data
type EquitiesBaseFixture = {
  equityWatchlist: readonly EquityInstrument[];
  equityQuotes: Record<string, EquityQuote>;
  equityCandles: Record<string, readonly Candle[]>;
  equityDepth: Record<string, DepthBook>;
  equityOrders: readonly EquityOrder[];
  equityPositions: readonly EquityPosition[];
  equityWorkspace: EqWorkspaceState;
};

// Base equities data used by all equities scenarios. equityWorkspace seeds a
// real selection (AAPL) with two extra open tabs, so the four-panel dock's
// ChartPanel/OrderTicket/WatchlistPanel render their SELECTED-instrument arms
// (not the `sel: ""` "SELECT AN INSTRUMENT" / unselected-row placeholder that
// the seam's own useEqWorkspace default falls back to) — mirrors the real
// composition root's peekFirstWatchlistSymbol seed (composition.ts).
const equitiesBase: EquitiesBaseFixture = {
  equityWatchlist: equityInstruments,
  equityQuotes,
  equityCandles: { AAPL: aaplCandles },
  equityDepth: { AAPL: aaplDepthBook },
  equityOrders,
  equityPositions,
  equityWorkspace: {
    sel: "AAPL",
    openTabs: ["AAPL", "MSFT", "JPM"],
    timeframe: "1D",
  },
};

// Order ticket states for the ticket-editing and ticket-filled scenarios
const orderTicketEditing: OrderTicketState = {
  phase: "editing",
  form: { symbol: "AAPL", side: "buy", type: "market", qty: 100 },
  error: null,
};

const orderTicketFilled: OrderTicketState = {
  phase: "filled",
  order: {
    id: "ord-001",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 100,
    status: "filled",
    filledQty: 100,
    avgPrice: 178.5,
    createdAt: 1_750_000_000_000,
  },
};

// Equities fixture entries — added to the fixtures map after the data constants
// are defined (module-level const ordering: the constants above are forward refs
// relative to the `export const fixtures = {…}` object literal, so they are
// added via index assignment after the object is closed).
fixtures["equities-loaded"] = makeAppData(equitiesBase);
// No instrument selected — the dock wrappers' "SELECT AN INSTRUMENT"
// placeholder arm (EqDepthDock; the seam's own sel:"" fallback).
fixtures["equities-no-selection"] = makeAppData({
  ...equitiesBase,
  equityWorkspace: { sel: "", openTabs: [], timeframe: "1D" },
});
fixtures["equities-ticket-editing"] = makeAppData({
  ...equitiesBase,
  equityOrderTicket: orderTicketEditing,
});
// Watchlist sort-cycle arms — same rows/quotes, different useEqWatchlistSort
// preference (the head's ⇅ chip). Default (unset → DEFAULT_EQ_WATCHLIST_SORT
// "chg") is covered by "equities-loaded" itself (equities/watchlist-loaded).
fixtures["equities-watchlist-sort-sym"] = makeAppData({
  ...equitiesBase,
  eqWatchlistSort: "sym",
});
fixtures["equities-watchlist-sort-price"] = makeAppData({
  ...equitiesBase,
  eqWatchlistSort: "price",
});
// Blotter view arms — same orders/positions data, different useEqBlotterView
// preference (the head's ▤/◴ tabs). Default ("orders") is covered by
// "equities-loaded" itself (equities/blotter-orders).
fixtures["equities-blotter-positions"] = makeAppData({
  ...equitiesBase,
  eqBlotterView: "positions",
});

fixtures["equities-ticket-filled"] = makeAppData({
  ...equitiesBase,
  equityOrderTicket: orderTicketFilled,
});

// ── Phase 5 Admin fixtures ─────────────────────────────────────────────────
// All data is FIXED (no simulator) so every pixel is deterministic.

const adminTopology: ServiceTopology = {
  nodes: [
    { name: "kernel", status: "ok", health: 98, throughput: 250, latencyMs: 8 },
    {
      name: "pricing",
      status: "ok",
      health: 98,
      throughput: 180,
      latencyMs: 5,
    },
    {
      name: "execution",
      status: "ok",
      health: 98,
      throughput: 90,
      latencyMs: 12,
    },
    { name: "blotter", status: "ok", health: 98, throughput: 60, latencyMs: 6 },
    {
      name: "analytics",
      status: "ok",
      health: 98,
      throughput: 40,
      latencyMs: 9,
    },
    {
      name: "credit",
      status: "degraded",
      health: 86,
      throughput: 30,
      latencyMs: 45,
    },
    { name: "refdata", status: "ok", health: 98, throughput: 20, latencyMs: 4 },
  ],
  edges: [
    { from: "kernel", to: "pricing", latencyMs: 5 },
    { from: "kernel", to: "execution", latencyMs: 12 },
    { from: "kernel", to: "blotter", latencyMs: 6 },
    { from: "kernel", to: "analytics", latencyMs: 9 },
    { from: "kernel", to: "credit", latencyMs: 45 },
    { from: "kernel", to: "refdata", latencyMs: 4 },
  ],
};

type AdminMetricWindows = {
  throughput: readonly MetricSample[];
  latency: readonly MetricSample[];
  errorRate: readonly MetricSample[];
};

const adminMetricSamples: AdminMetricWindows = {
  throughput: [
    { t: 1_750_000_000_000, value: 180 },
    { t: 1_750_000_001_000, value: 210 },
    { t: 1_750_000_002_000, value: 195 },
    { t: 1_750_000_003_000, value: 230 },
    { t: 1_750_000_004_000, value: 250 },
  ],
  latency: [
    { t: 1_750_000_000_000, value: 8 },
    { t: 1_750_000_001_000, value: 10 },
    { t: 1_750_000_002_000, value: 7 },
    { t: 1_750_000_003_000, value: 12 },
    { t: 1_750_000_004_000, value: 9 },
  ],
  errorRate: [
    { t: 1_750_000_000_000, value: 0.01 },
    { t: 1_750_000_001_000, value: 0.02 },
    { t: 1_750_000_002_000, value: 0.0 },
    { t: 1_750_000_003_000, value: 0.01 },
    { t: 1_750_000_004_000, value: 0.0 },
  ],
};

// Fixed log events: info/warn/error severity arms (newest-first when rendered).
const adminEvents: readonly LogEvent[] = [
  {
    t: 1_750_000_004_000,
    severity: "error",
    service: "credit",
    message: "Connection timeout — retrying",
  },
  {
    t: 1_750_000_003_000,
    severity: "warn",
    service: "pricing",
    message: "Latency spike detected: 45ms",
  },
  {
    t: 1_750_000_002_000,
    severity: "info",
    service: "kernel",
    message: "Heartbeat OK",
  },
  {
    t: 1_750_000_001_000,
    severity: "info",
    service: "execution",
    message: "Order acknowledged",
  },
];

const adminSessionData: readonly SessionInfo[] = [
  {
    id: "sess-001",
    user: "trader-alpha",
    region: "EMEA",
    lat: 51.5,
    lon: -0.1,
  },
  {
    id: "sess-002",
    user: "trader-beta",
    region: "APAC",
    lat: 35.7,
    lon: 139.7,
  },
];

// "admin-loaded": all admin telemetry cards rendered with seeded deterministic data.
fixtures["admin-loaded"] = makeAppData({
  throughput: { value: 250, loading: false, message: null },
  adminMetrics: adminMetricSamples,
  adminTopology,
  adminEventLog: adminEvents,
  adminSessions: adminSessionData,
});

// "admin-incident-active": serviceDown incident active → "Inject service down"
// button has data-active="true" and the Clear button is also active. State is
// injected through the seam (no click / timing needed).
fixtures["admin-incident-active"] = makeAppData({
  throughput: { value: 250, loading: false, message: null },
  adminMetrics: adminMetricSamples,
  adminTopology,
  adminEventLog: adminEvents,
  adminSessions: adminSessionData,
  adminIncident: { active: ["serviceDown"] },
});

// KpiRow isolated warn arm: latency's last sample (65ms) and error-rate's
// last sample (0.92%) both cross their warn thresholds (lat>60, err>0.8) —
// the accent-negative value/delta colour on those two cards. Throughput and
// sessions never warn (kpisVm's `noWarn`), so only lat/err flip.
const adminKpiWarnSamples: AdminMetricWindows = {
  throughput: [
    { t: 1_750_000_000_000, value: 180 },
    { t: 1_750_000_001_000, value: 190 },
    { t: 1_750_000_002_000, value: 200 },
    { t: 1_750_000_003_000, value: 210 },
    { t: 1_750_000_004_000, value: 220 },
  ],
  latency: [
    { t: 1_750_000_000_000, value: 20 },
    { t: 1_750_000_001_000, value: 30 },
    { t: 1_750_000_002_000, value: 45 },
    { t: 1_750_000_003_000, value: 55 },
    { t: 1_750_000_004_000, value: 65 },
  ],
  errorRate: [
    { t: 1_750_000_000_000, value: 0.1 },
    { t: 1_750_000_001_000, value: 0.3 },
    { t: 1_750_000_002_000, value: 0.5 },
    { t: 1_750_000_003_000, value: 0.7 },
    { t: 1_750_000_004_000, value: 0.92 },
  ],
};
fixtures["admin-kpi-warn"] = makeAppData({
  throughput: { value: 250, loading: false, message: null },
  adminMetrics: adminKpiWarnSamples,
});

// ServiceHealth isolated mixed-status arm: ok + degraded + down in one
// topology snapshot. "down" is a real-app extra the topology simulator can
// emit that PROTO never modelled (servicesVm's em-dash uptime + red row).
const adminTopologyMixed: ServiceTopology = {
  nodes: [
    { name: "kernel", status: "ok", health: 98, throughput: 250, latencyMs: 8 },
    {
      name: "credit",
      status: "degraded",
      health: 86,
      throughput: 30,
      latencyMs: 45,
    },
    {
      name: "execution",
      status: "down",
      health: 0,
      throughput: 0,
      latencyMs: 0,
    },
  ],
  edges: [],
};
fixtures["admin-service-mixed"] = makeAppData({
  adminTopology: adminTopologyMixed,
});
