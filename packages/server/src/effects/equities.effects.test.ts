import { of, Subject, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";
import { combineEffects, createWsListener } from "@rtc/ws-effects";

import type { Ctx } from "./context.js";
import { equitiesEffects } from "./equities.effects.js";

describe("equities effects", () => {
  it("streams the watchlist as-is on SUBSCRIBE_WATCHLIST", () => {
    const instrument = {
      symbol: "AAPL",
      name: "Apple Inc.",
      exchange: "NASDAQ",
    };
    const ctx = {
      marketData: {
        watchlist: vi.fn(() => {
          return of([instrument]);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_WATCHLIST, payload: {} });
    expect(sent).toEqual([
      { type: SERVER_MSG.WATCHLIST, payload: [instrument] },
    ]);
  });

  it("streams a matching-symbol quote as-is on SUBSCRIBE_EQ_QUOTES", () => {
    const quote = {
      symbol: "AAPL",
      bid: 100,
      ask: 100.1,
      last: 100.05,
      changePct: 0.5,
      timestamp: 1,
    };
    const ctx = {
      marketData: {
        quotes: vi.fn(() => {
          return of(quote);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.SUBSCRIBE_EQ_QUOTES,
      payload: { symbol: "AAPL" },
    });
    expect(sent).toEqual([{ type: SERVER_MSG.EQ_QUOTE, payload: quote }]);
    expect(ctx.marketData.quotes).toHaveBeenCalledWith("AAPL");
  });

  it("streams the depth book as-is on SUBSCRIBE_DEPTH", () => {
    const book = {
      symbol: "AAPL",
      bids: [{ price: 100, size: 10 }],
      asks: [{ price: 100.1, size: 5 }],
    };
    const ctx = {
      marketData: {
        depth: vi.fn(() => {
          return of(book);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.SUBSCRIBE_DEPTH,
      payload: { symbol: "AAPL" },
    });
    expect(sent).toEqual([{ type: SERVER_MSG.DEPTH, payload: book }]);
    expect(ctx.marketData.depth).toHaveBeenCalledWith("AAPL");
  });

  it("streams the order book as-is on SUBSCRIBE_ORDERS", () => {
    const order = {
      id: "o1",
      symbol: "AAPL",
      side: "buy",
      type: "market",
      qty: 10,
      status: "filled",
      filledQty: 10,
      createdAt: 1,
    };
    const ctx = {
      orders: {
        orders: vi.fn(() => {
          return of([order]);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_ORDERS, payload: {} });
    expect(sent).toEqual([{ type: SERVER_MSG.ORDERS, payload: [order] }]);
  });

  it("streams the position book as-is on SUBSCRIBE_POSITIONS", () => {
    const position = {
      symbol: "AAPL",
      qty: 10,
      avgPrice: 100,
      markPrice: 101,
      unrealisedPnl: 10,
    };
    const ctx = {
      positions: {
        positions: vi.fn(() => {
          return of([position]);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_POSITIONS, payload: {} });
    expect(sent).toEqual([{ type: SERVER_MSG.POSITIONS, payload: [position] }]);
  });

  it("acks getCandles with the candles array", () => {
    const candle = { time: 1, open: 100, high: 101, low: 99, close: 100.5 };
    const ctx = {
      marketData: {
        candles: vi.fn(() => {
          return of([candle]);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.GET_CANDLES,
      payload: { symbol: "AAPL" },
      correlationId: "1",
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.CANDLES_RESPONSE,
        payload: { type: "ack", payload: [candle] },
        correlationId: "1",
      },
    ]);
    expect(ctx.marketData.candles).toHaveBeenCalledWith("AAPL");
  });

  it("acks cancelOrder", () => {
    const ctx = {
      orders: {
        cancel: vi.fn(() => {
          return of(undefined);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.CANCEL_ORDER,
      payload: { orderId: "o1" },
      correlationId: "2",
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.CANCEL_ORDER_RESPONSE,
        payload: { type: "ack" },
        correlationId: "2",
      },
    ]);
    expect(ctx.orders.cancel).toHaveBeenCalledWith("o1");
  });

  it("placeOrder$ acks with orderId and streams lifecycle", () => {
    const order = {
      id: "o1",
      symbol: "AAPL",
      side: "buy",
      type: "market",
      qty: 10,
      status: "filled",
      filledQty: 10,
      createdAt: 1,
    };
    const ctx = {
      orders: {
        place: vi.fn(() => {
          return of(order);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.PLACE_ORDER,
      payload: { symbol: "AAPL", side: "buy", type: "market", qty: 10 },
      correlationId: "7",
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.PLACE_ORDER_RESPONSE,
        payload: { type: "ack", payload: { orderId: "o1" } },
        correlationId: "7",
      },
      { type: SERVER_MSG.ORDER_LIFECYCLE, payload: order },
    ]);
    expect(ctx.orders.place).toHaveBeenCalledWith({
      symbol: "AAPL",
      side: "buy",
      type: "market",
      qty: 10,
    });
    // One order → exactly one place() call (guards against a shareReplay
    // re-subscribe ever double-invoking the side-effecting sim call).
    expect(ctx.orders.place).toHaveBeenCalledTimes(1);
  });

  it("placeOrder$ nacks on a place error and keeps serving later orders", () => {
    const order = {
      id: "o2",
      symbol: "AAPL",
      side: "buy",
      type: "market",
      qty: 5,
      status: "filled",
      filledQty: 5,
      createdAt: 2,
    };
    const place = vi
      .fn()
      .mockReturnValueOnce(
        throwError(() => {
          return new Error("boom");
        }),
      )
      .mockReturnValueOnce(of(order));
    const ctx = { orders: { place } };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    // First order errors → a nack, no lifecycle frame.
    messages$.next({
      type: CLIENT_MSG.PLACE_ORDER,
      payload: { symbol: "AAPL", side: "buy", type: "market", qty: 5 },
      correlationId: "8",
    });
    // Second order is still handled — the error was isolated to the first.
    messages$.next({
      type: CLIENT_MSG.PLACE_ORDER,
      payload: { symbol: "AAPL", side: "buy", type: "market", qty: 5 },
      correlationId: "9",
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.PLACE_ORDER_RESPONSE,
        payload: { type: "nack" },
        correlationId: "8",
      },
      {
        type: SERVER_MSG.PLACE_ORDER_RESPONSE,
        payload: { type: "ack", payload: { orderId: "o2" } },
        correlationId: "9",
      },
      { type: SERVER_MSG.ORDER_LIFECYCLE, payload: order },
    ]);
    expect(place).toHaveBeenCalledTimes(2);
  });
});

interface Harness {
  readonly messages$: Subject<Inbound>;
  readonly sent: Outbound[];
}

function harness(ctx: Partial<Ctx>): Harness {
  const messages$ = new Subject<Inbound>();
  const closed$ = new Subject<void>();
  const sent: Outbound[] = [];
  const socket: Socket = {
    messages$,
    closed$,
    send: (m: Outbound) => {
      sent.push(m);
    },
  };
  createWsListener(combineEffects(...equitiesEffects), ctx as Ctx)(socket);
  return { messages$, sent };
}
