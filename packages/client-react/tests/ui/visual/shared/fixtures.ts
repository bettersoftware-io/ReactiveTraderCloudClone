import {
  ADAPTIVE_BANK_NAME,
  ConnectionStatus,
  type CurrencyPair,
  type Dealer,
  Direction,
  ExecutionStatus,
  type Instrument,
  type PositionUpdates,
  type Price,
  PriceMovementType,
  type PriceTick,
  type Quote,
  RFQ_THRESHOLD,
  RFQ_TIMEOUT_MS,
  type Rfq,
  RfqState,
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
};
const usdjpy: CurrencyPair = {
  symbol: "USDJPY",
  ratePrecision: 3,
  pipsPosition: 2,
  base: "USD",
  terms: "JPY",
  defaultNotional: 1_000_000,
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

// Analytics arms: negative latest PnL + a negative current position (PnlValue /
// PnlChart negative colour arms); an empty panel (no positions, no history);
// and all-flat positions (PositionBubbles maxAbsPnl === 0 degenerate arm).
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

// Credit fixture — instrument/dealer/rfq/quote ids are cross-linked:
//   RfqTilesPanel (default "Live" filter) needs an Open rfq + its quotes;
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
  },
  {
    id: 2,
    name: "Apple Inc 2030",
    cusip: "037833EK8",
    ticker: "AAPL 2.4 30",
    maturity: "2030-05-11",
    interestRate: 2.4,
    benchmark: "7Y",
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
  [...creditQuotes101, ...creditQuotes102].map((q) => [q.id, q]),
);

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

// Single-RFQ-per-card fixtures for the prop-driven RfqCard key. Each pairs one
// Rfq (in a terminal/badge state) with quotes that exercise a QuoteCard arm.
// stateLabel/stateBadgeColor (Done/Expired/Cancelled) + canDismiss live on the
// Rfq state; the accepted/passed quote-colour arms live on the Quote state.
const rfqDone: Rfq = {
  id: 201,
  instrumentId: 1,
  quantity: 5_000_000,
  direction: Direction.Buy,
  state: RfqState.Closed,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
const rfqDoneQuotes: readonly Quote[] = [
  {
    id: 3001,
    rfqId: 201,
    dealerId: 2,
    state: { type: "accepted", price: 99.1 },
  },
  {
    id: 3002,
    rfqId: 201,
    dealerId: 3,
    state: { type: "rejectedWithPrice", price: 99.4 },
  },
];
const rfqExpired: Rfq = {
  id: 202,
  instrumentId: 2,
  quantity: 2_000_000,
  direction: Direction.Sell,
  state: RfqState.Expired,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
const rfqExpiredQuotes: readonly Quote[] = [
  {
    id: 3101,
    rfqId: 202,
    dealerId: 2,
    state: { type: "rejectedWithoutPrice" },
  },
];
const rfqCancelled: Rfq = {
  id: 203,
  instrumentId: 1,
  quantity: 3_000_000,
  direction: Direction.Buy,
  state: RfqState.Cancelled,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
const rfqCancelledQuotes: readonly Quote[] = [
  { id: 3201, rfqId: 203, dealerId: 2, state: { type: "pendingWithoutPrice" } },
];
const rfqAccepted: Rfq = {
  id: 204,
  instrumentId: 1,
  quantity: 4_000_000,
  direction: Direction.Buy,
  state: RfqState.Closed,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
const rfqAcceptedQuotes: readonly Quote[] = [
  {
    id: 3301,
    rfqId: 204,
    dealerId: 2,
    state: { type: "accepted", price: 100.75 },
  },
  {
    id: 3302,
    rfqId: 204,
    dealerId: 3,
    state: { type: "pendingWithPrice", price: 100.9 },
  },
];
const rfqPassed: Rfq = {
  id: 205,
  instrumentId: 2,
  quantity: 1_500_000,
  direction: Direction.Sell,
  state: RfqState.Closed,
  expirySecs: 120,
  creationTimestamp: 1_750_000_300_000,
};
const rfqPassedQuotes: readonly Quote[] = [
  { id: 3401, rfqId: 205, dealerId: 2, state: { type: "passed" } },
  {
    id: 3402,
    rfqId: 205,
    dealerId: 3,
    state: { type: "accepted", price: 97.6 },
  },
];

function rfqCardFixture(rfq: Rfq, quotes: readonly Quote[]): AppData {
  return makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [rfq],
    quotesForRfq: { [rfq.id]: quotes },
    allQuotes: new Map(quotes.map((q) => [q.id, q])),
  });
}

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
const eurusdTileBase = {
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
  dealtCurrency: "USD",
};

// TileNotional error arm: an invalid notional draft drives the
// `state.error ? "var(--accent-negative)"` underline + the error <span>.
const erroredNotional = {
  displayValue: "abc",
  numericValue: NaN,
  error: "Invalid notional",
  isRfq: false,
  isDefault: false,
};

// RFQ-active layout: a notional at/above RFQ_THRESHOLD flips the tile to the
// TileRfq body (Tile only renders TileRfq when notional.state.isRfq is true).
const rfqNotional = {
  displayValue: RFQ_THRESHOLD.toLocaleString("en-US"),
  numericValue: RFQ_THRESHOLD,
  error: null,
  isRfq: true,
  isDefault: false,
};

// A received quote built from the EURUSD price. totalMs = RFQ_TIMEOUT_MS so the
// countdown fraction is remainingMs / RFQ_TIMEOUT_MS.
const eurusdQuote = {
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
  "live-rates-populated": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
  }),
  // Same data as live-rates-populated but seeded into price view through the
  // seam (viewMode "price"). The view mode now lives behind PreferencesPort, so
  // the price-mode arm is reached by seeding state, not by a runtime toggle —
  // the rendered output (charts suppressed, ViewToggle offers "Chart") is identical.
  "live-rates-price": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
    viewMode: "price",
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
  // Light-theme variant of the FX page. The theme now lives behind
  // PreferencesPort, so the light arm is reached by seeding theme "light" rather
  // than clicking the toggle — the rendered output is identical to the old
  // post-click state, and the ThemeToggle's aria-label reads "Switch to dark theme".
  "app-fx-light": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
    analytics: analyticsData,
    connectionStatus: ConnectionStatus.CONNECTED,
    throughput: { value: 250, loading: false, message: null },
    theme: "light",
  }),
  "fx-trades": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
    trades: fxTrades,
  }),
  "credit-populated": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: creditRfqs,
    quotesForRfq: { 101: creditQuotes101, 102: creditQuotes102 },
    allQuotes: creditAllQuotes,
  }),
  // NewRfqForm submission lifecycle render arms (seeded via the submission seam,
  // since these states are only transiently reachable through interaction).
  "credit-new-rfq-submitting": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqSubmission: { status: "submitting" },
  }),
  "credit-new-rfq-confirmed": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqSubmission: { status: "confirmed", rfqId: 12345 },
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
  // Credit RFQ-card terminal states (prop-driven RfqCard key).
  "rfq-done": rfqCardFixture(rfqDone, rfqDoneQuotes),
  "rfq-expired": rfqCardFixture(rfqExpired, rfqExpiredQuotes),
  "rfq-cancelled": rfqCardFixture(rfqCancelled, rfqCancelledQuotes),
  "rfq-accepted": rfqCardFixture(rfqAccepted, rfqAcceptedQuotes),
  "rfq-passed": rfqCardFixture(rfqPassed, rfqPassedQuotes),
  // RfqTilesPanel empty arm: no rfqs => "No RFQs to display".
  "rfq-tiles-empty": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [],
  }),
  // SellSidePanel arms (need an Adaptive Bank quote per RFQ).
  "sell-side-active": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [sellSideActiveRfq],
    quotesForRfq: { 301: sellSideActiveQuotes },
    allQuotes: new Map(sellSideActiveQuotes.map((q) => [q.id, q])),
  }),
  "sell-side-responded": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: [sellSideRespondedRfq],
    quotesForRfq: { 302: sellSideRespondedQuotes },
    allQuotes: new Map(sellSideRespondedQuotes.map((q) => [q.id, q])),
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
};
