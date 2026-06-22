/**
 * Canonical server-frame factories for the Phase 5C contract suite.
 * Both FakeWsAdapter (in @rtc/client-react tests) and any future server-side
 * contract tests consume these so the fake-WS protocol can't silently
 * drift from the real wire shapes.
 *
 * Typed against the DTOs in @rtc/shared — if a DTO shape changes, the
 * fixture compile fails before any test runs.
 */
import { Direction, TradeStatus } from "@rtc/domain";

import type {
  AnalyticsDto,
  BlotterMessage,
  DealerDto,
  DealerEvent,
  ExecutionResponseDto,
  InstrumentDto,
  InstrumentEvent,
  PriceHistoryDto,
  PriceTickDto,
  QuoteBodyDto,
  ReferenceDataMessage,
  RfqBodyDto,
  RpcResponse,
  TradeDto,
  WorkflowEvent,
} from "../index.js";

// ── Reference data ─────────────────────────────────────────────

export function referenceDataFrame(): ReferenceDataMessage {
  return {
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
  };
}

// ── Pricing ────────────────────────────────────────────────────

export function priceTickFrame(
  symbol: string,
  opts?: Partial<PriceTickDto>,
): PriceTickDto {
  return {
    symbol,
    bid: 1.0998,
    ask: 1.1002,
    mid: 1.1,
    creationTimestamp: Date.now(),
    valueDate: new Date().toISOString().slice(0, 10),
    ...opts,
  };
}

export function priceHistoryResponse(
  symbol: string,
  count = 50,
): RpcResponse<PriceHistoryDto> {
  return {
    type: "ack",
    payload: {
      prices: Array.from({ length: count }, (_, i) => {
        return priceTickFrame(symbol, {
          mid: 1.1 + i * 0.0001,
          bid: 1.0998 + i * 0.0001,
          ask: 1.1002 + i * 0.0001,
        });
      }),
    },
  };
}

// ── Execution ──────────────────────────────────────────────────

export function executionResponseAck(
  opts?: Partial<ExecutionResponseDto>,
): RpcResponse<ExecutionResponseDto> {
  return {
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
  };
}

export function rpcNack(): RpcResponse {
  return {
    type: "nack",
  };
}

// ── Blotter ────────────────────────────────────────────────────

export function tradeFrame(opts?: Partial<TradeDto>): TradeDto {
  return {
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
  };
}

export function blotterFrame(trades: TradeDto[]): BlotterMessage {
  return {
    updates: trades,
    isStateOfTheWorld: true,
    isStale: false,
  };
}

// ── Analytics ──────────────────────────────────────────────────

export function analyticsFrame(opts?: Partial<AnalyticsDto>): AnalyticsDto {
  return {
    currentPositions: [
      {
        symbol: "EURUSD",
        basePnl: 0,
        baseTradedAmount: 0,
        counterTradedAmount: 0,
      },
    ],
    history: [
      { timestamp: new Date(Date.now() - 1000).toISOString(), usdPnl: 0 },
      { timestamp: new Date().toISOString(), usdPnl: 0 },
    ],
    ...opts,
  };
}

// ── Instruments ────────────────────────────────────────────────

export function instrumentDto(opts?: Partial<InstrumentDto>): InstrumentDto {
  return {
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
  };
}

export function instrumentStartOfSoW(): InstrumentEvent {
  return {
    type: "startOfStateOfTheWorld",
  };
}

export function instrumentEndOfSoW(): InstrumentEvent {
  return {
    type: "endOfStateOfTheWorld",
  };
}

export function instrumentAdded(
  inst?: Partial<InstrumentDto>,
): InstrumentEvent {
  return {
    type: "added",
    payload: instrumentDto(inst),
  };
}

export function instrumentRemoved(id: number): InstrumentEvent {
  return {
    type: "removed",
    payload: id,
  };
}

// ── Dealers ────────────────────────────────────────────────────

export function dealerDto(opts?: Partial<DealerDto>): DealerDto {
  return {
    id: 1,
    name: "Acme Bank",
    ...opts,
  };
}

export function dealerStartOfSoW(): DealerEvent {
  return {
    type: "startOfStateOfTheWorld",
  };
}

export function dealerEndOfSoW(): DealerEvent {
  return {
    type: "endOfStateOfTheWorld",
  };
}

export function dealerAdded(d?: Partial<DealerDto>): DealerEvent {
  return {
    type: "added",
    payload: dealerDto(d),
  };
}

export function dealerRemoved(id: number): DealerEvent {
  return {
    type: "removed",
    payload: id,
  };
}

// ── Workflow / RFQ ─────────────────────────────────────────────

export function rfqBodyDto(opts?: Partial<RfqBodyDto>): RfqBodyDto {
  return {
    id: 1,
    instrumentId: 1,
    quantity: 1_000_000,
    direction: Direction.Buy,
    state: "Open",
    expirySecs: 120,
    creationTimestamp: Date.now(),
    ...opts,
  };
}

export function quoteBodyDto(opts?: Partial<QuoteBodyDto>): QuoteBodyDto {
  return {
    id: 1,
    rfqId: 1,
    dealerId: 1,
    state: { type: "pendingWithoutPrice" },
    ...opts,
  };
}

export function workflowEventCreated(rfqId: number): WorkflowEvent {
  return {
    type: "rfqCreated",
    payload: rfqBodyDto({ id: rfqId }),
  };
}

export function workflowEventAccepted(
  rfqId: number,
  quoteId: number,
): WorkflowEvent {
  return {
    type: "quoteAccepted",
    payload: quoteBodyDto({
      id: quoteId,
      rfqId,
      state: { type: "accepted", price: 100 },
    }),
  };
}

export function rpcAck<T>(payload: T): RpcResponse<T> {
  return {
    type: "ack",
    payload,
  };
}
