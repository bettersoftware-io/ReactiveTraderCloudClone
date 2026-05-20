/**
 * Canonical server-frame factories for the Phase 5C contract suite.
 * Both FakeWsAdapter (in @rtc/client tests) and any future server-side
 * contract tests consume these so the fake-WS protocol can't silently
 * drift from the real wire shapes.
 *
 * Typed against the DTOs in @rtc/shared — if a DTO shape changes, the
 * fixture compile fails before any test runs.
 */
import { Direction, TradeStatus } from "@rtc/domain";
import type {
  ReferenceDataMessage,
  PriceTickDto,
  PriceHistoryDto,
  BlotterMessage,
  TradeDto,
  AnalyticsDto,
  ExecutionResponseDto,
  InstrumentEvent,
  InstrumentDto,
  DealerEvent,
  DealerDto,
  WorkflowEvent,
  RpcResponse,
  RfqBodyDto,
  QuoteBodyDto,
} from "../index.js";

// ── Reference data ─────────────────────────────────────────────

export const referenceDataFrame = (): ReferenceDataMessage => ({
  updates: [
    { symbol: "EURUSD", ratePrecision: 5, pipsPosition: 4 },
    { symbol: "USDJPY", ratePrecision: 3, pipsPosition: 2 },
    { symbol: "GBPUSD", ratePrecision: 5, pipsPosition: 4 },
    { symbol: "GBPJPY", ratePrecision: 3, pipsPosition: 2 },
    { symbol: "EURJPY", ratePrecision: 3, pipsPosition: 2 },
    { symbol: "AUDUSD", ratePrecision: 5, pipsPosition: 4 },
    { symbol: "NZDUSD", ratePrecision: 5, pipsPosition: 4 },
    { symbol: "EURCAD", ratePrecision: 5, pipsPosition: 4 },
    { symbol: "EURAUD", ratePrecision: 5, pipsPosition: 4 },
  ],
  isStateOfTheWorld: true,
  isStale: false,
});

// ── Pricing ────────────────────────────────────────────────────

export const priceTickFrame = (
  symbol: string,
  opts?: Partial<PriceTickDto>,
): PriceTickDto => ({
  symbol,
  bid: 1.0998,
  ask: 1.1002,
  mid: 1.1,
  creationTimestamp: Date.now(),
  valueDate: new Date().toISOString().slice(0, 10),
  ...opts,
});

export const priceHistoryResponse = (
  symbol: string,
  count = 50,
): RpcResponse<PriceHistoryDto> => ({
  type: "ack",
  payload: {
    prices: Array.from({ length: count }, (_, i) =>
      priceTickFrame(symbol, {
        mid: 1.1 + i * 0.0001,
        bid: 1.0998 + i * 0.0001,
        ask: 1.1002 + i * 0.0001,
      }),
    ),
  },
});

// ── Execution ──────────────────────────────────────────────────

export const executionResponseAck = (
  opts?: Partial<ExecutionResponseDto>,
): RpcResponse<ExecutionResponseDto> => ({
  type: "ack",
  payload: {
    tradeId: 1,
    tradeName: "TRD-1",
    currencyPair: "EURUSD",
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.1,
    status: TradeStatus.Done,
    tradeDate: new Date().toISOString(),
    valueDate: new Date().toISOString().slice(0, 10),
    ...opts,
  },
});

export const rpcNack = (): RpcResponse => ({
  type: "nack",
});

// ── Blotter ────────────────────────────────────────────────────

export const tradeFrame = (opts?: Partial<TradeDto>): TradeDto => ({
  tradeId: 1,
  tradeName: "TRD-1",
  currencyPair: "EURUSD",
  notional: 1_000_000,
  dealtCurrency: "EUR",
  direction: Direction.Buy,
  spotRate: 1.1,
  status: TradeStatus.Done,
  tradeDate: new Date().toISOString(),
  valueDate: new Date().toISOString().slice(0, 10),
  ...opts,
});

export const blotterFrame = (trades: TradeDto[]): BlotterMessage => ({
  updates: trades,
  isStateOfTheWorld: true,
  isStale: false,
});

// ── Analytics ──────────────────────────────────────────────────

export const analyticsFrame = (
  opts?: Partial<AnalyticsDto>,
): AnalyticsDto => ({
  currentPositions: [
    { symbol: "EURUSD", basePnl: 0, baseTradedAmount: 0, counterTradedAmount: 0 },
  ],
  history: [
    { timestamp: new Date(Date.now() - 1000).toISOString(), usdPnl: 0 },
    { timestamp: new Date().toISOString(), usdPnl: 0 },
  ],
  ...opts,
});

// ── Instruments ────────────────────────────────────────────────

export const instrumentDto = (
  opts?: Partial<InstrumentDto>,
): InstrumentDto => ({
  id: 1,
  name: "US Treasury 10Y",
  cusip: "912828C57",
  ticker: "T",
  maturity: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10),
  interestRate: 0.04,
  benchmark: "T",
  ...opts,
});

export const instrumentStartOfSoW = (): InstrumentEvent => ({
  type: "startOfStateOfTheWorld",
});

export const instrumentEndOfSoW = (): InstrumentEvent => ({
  type: "endOfStateOfTheWorld",
});

export const instrumentAdded = (inst?: Partial<InstrumentDto>): InstrumentEvent => ({
  type: "added",
  payload: instrumentDto(inst),
});

export const instrumentRemoved = (id: number): InstrumentEvent => ({
  type: "removed",
  payload: id,
});

// ── Dealers ────────────────────────────────────────────────────

export const dealerDto = (opts?: Partial<DealerDto>): DealerDto => ({
  id: 1,
  name: "Acme Bank",
  ...opts,
});

export const dealerStartOfSoW = (): DealerEvent => ({
  type: "startOfStateOfTheWorld",
});

export const dealerEndOfSoW = (): DealerEvent => ({
  type: "endOfStateOfTheWorld",
});

export const dealerAdded = (d?: Partial<DealerDto>): DealerEvent => ({
  type: "added",
  payload: dealerDto(d),
});

export const dealerRemoved = (id: number): DealerEvent => ({
  type: "removed",
  payload: id,
});

// ── Workflow / RFQ ─────────────────────────────────────────────

export const rfqBodyDto = (opts?: Partial<RfqBodyDto>): RfqBodyDto => ({
  id: 1,
  instrumentId: 1,
  quantity: 1_000_000,
  direction: Direction.Buy,
  state: "Open",
  expirySecs: 120,
  creationTimestamp: Date.now(),
  ...opts,
});

export const quoteBodyDto = (opts?: Partial<QuoteBodyDto>): QuoteBodyDto => ({
  id: 1,
  rfqId: 1,
  dealerId: 1,
  state: { type: "pendingWithoutPrice" },
  ...opts,
});

export const workflowEventCreated = (rfqId: number): WorkflowEvent => ({
  type: "rfqCreated",
  payload: rfqBodyDto({ id: rfqId }),
});

export const workflowEventAccepted = (
  rfqId: number,
  quoteId: number,
): WorkflowEvent => ({
  type: "quoteAccepted",
  payload: quoteBodyDto({
    id: quoteId,
    rfqId,
    state: { type: "accepted", price: 100 },
  }),
});

export const rpcAck = <T>(payload: T): RpcResponse<T> => ({
  type: "ack",
  payload,
});
