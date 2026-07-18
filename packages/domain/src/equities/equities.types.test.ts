import { describe, expect, it } from "vitest";

import type {
  Candle,
  CandleTimeframe,
  DepthBook,
  DepthLevel,
  EquityInstrument,
  EquityOrder,
  EquityPosition,
  EquityQuote,
  OrderSide,
  OrderStatus,
  OrderType,
} from "./index.js";
import { CANDLE_TIMEFRAMES } from "./index.js";

describe("equities entities", () => {
  it("compose a working order across the full lifecycle vocabulary", () => {
    const instrument: EquityInstrument = {
      symbol: "AAPL",
      name: "Apple Inc.",
      exchange: "NASDAQ",
    };

    const quote: EquityQuote = {
      symbol: "AAPL",
      bid: 189.9,
      ask: 190.1,
      last: 190.0,
      changePct: 0.42,
      timestamp: 1_700_000_000_000,
    };

    const candle: Candle = {
      time: 1_700_000_000_000,
      open: 189.5,
      high: 190.5,
      low: 189.0,
      close: 190.0,
    };
    const side: OrderSide = "buy";
    const type: OrderType = "limit";
    const statuses: OrderStatus[] = [
      "new",
      "working",
      "partiallyFilled",
      "filled",
      "cancelled",
      "rejected",
    ];

    const order: EquityOrder = {
      id: "o-1",
      symbol: "AAPL",
      side,
      type,
      qty: 100,
      limitPrice: 190,
      status: "working",
      filledQty: 0,
      createdAt: 1_700_000_000_000,
    };

    const position: EquityPosition = {
      symbol: "AAPL",
      qty: 100,
      avgPrice: 190,
      markPrice: 191,
      unrealisedPnl: 100,
    };
    const level: DepthLevel = { price: 190, size: 500 };
    const book: DepthBook = { symbol: "AAPL", bids: [level], asks: [level] };
    const timeframe: CandleTimeframe = "1W";

    expect(instrument.exchange).toBe("NASDAQ");
    expect(quote.ask).toBeGreaterThan(quote.bid);
    expect(candle.high).toBeGreaterThanOrEqual(candle.close);
    expect(statuses).toHaveLength(6);
    expect(order.status).toBe("working");
    expect(position.unrealisedPnl).toBe(100);
    expect(book.bids[0]?.size).toBe(500);
    expect(timeframe).toBe("1W");
  });

  it("CANDLE_TIMEFRAMES enumerates the four supported timeframes in ascending span order", () => {
    expect(CANDLE_TIMEFRAMES).toEqual(["1D", "1W", "1M", "3M"]);
  });
});
