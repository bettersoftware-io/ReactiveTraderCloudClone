import { from, of, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { PriceTick } from "@rtc/domain";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";
import { combineEffects, createWsListener } from "@rtc/ws-effects";

import type { Ctx } from "./context.js";
import { fxEffects } from "./fx.effects.js";

describe("fx effects", () => {
  it("streams currency pairs as ReferenceDataMessage with SoW flag true only on the first emission", () => {
    const pairs = [
      {
        symbol: "EURUSD",
        ratePrecision: 5,
        pipsPosition: 4,
        base: "EUR",
        terms: "USD",
        defaultNotional: 1_000_000,
        baseMid: 1.09213,
        typicalSpreadPips: 1.4,
      },
    ];
    const ctx = {
      referenceData: {
        getCurrencyPairs: vi.fn(() => {
          return from([pairs, pairs]);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_REFERENCE_DATA, payload: {} });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.REFERENCE_DATA,
        payload: {
          updates: [
            {
              symbol: "EURUSD",
              ratePrecision: 5,
              pipsPosition: 4,
              baseMid: 1.09213,
              typicalSpreadPips: 1.4,
            },
          ],
          isStateOfTheWorld: true,
          isStale: false,
        },
      },
      {
        type: SERVER_MSG.REFERENCE_DATA,
        payload: {
          updates: [
            {
              symbol: "EURUSD",
              ratePrecision: 5,
              pipsPosition: 4,
              baseMid: 1.09213,
              typicalSpreadPips: 1.4,
            },
          ],
          isStateOfTheWorld: false,
          isStale: false,
        },
      },
    ]);
  });

  it("streams price ticks as PriceTickDto on subscribe.pricing", () => {
    const tick = {
      symbol: "EURUSD",
      bid: 1.1,
      ask: 1.1002,
      mid: 1.1001,
      valueDate: "2026-07-02",
      creationTimestamp: 1,
    };
    const ctx = {
      pricing: {
        getPriceUpdates: vi.fn(() => {
          return of(tick);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.SUBSCRIBE_PRICING,
      payload: { symbol: "EURUSD" },
    });
    expect(sent).toEqual([{ type: SERVER_MSG.PRICE_TICK, payload: tick }]);
  });

  it("coalesces a duplicate subscribe.pricing for the same symbol into ONE stream", () => {
    // The client re-sends subscribe.pricing whenever a filter toggle re-mounts
    // a tile/row; a second subscribe for an already-live symbol must NOT open a
    // second price stream (the accumulation bug that made ticks accelerate).
    const ticks$ = new Subject<PriceTick>();
    const ctx = {
      pricing: {
        getPriceUpdates: vi.fn(() => {
          return ticks$;
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);

    messages$.next({
      type: CLIENT_MSG.SUBSCRIBE_PRICING,
      payload: { symbol: "EURUSD" },
    });
    messages$.next({
      type: CLIENT_MSG.SUBSCRIBE_PRICING,
      payload: { symbol: "EURUSD" },
    });

    expect(ctx.pricing.getPriceUpdates).toHaveBeenCalledTimes(1);

    ticks$.next(makeTick("EURUSD"));
    expect(sent).toEqual([
      { type: SERVER_MSG.PRICE_TICK, payload: makeTick("EURUSD") },
    ]);
  });

  it("stops a symbol's stream after unsubscribe.pricing releases the last subscriber", () => {
    const ticks$ = new Subject<PriceTick>();
    const ctx = {
      pricing: {
        getPriceUpdates: vi.fn(() => {
          return ticks$;
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);

    messages$.next({
      type: CLIENT_MSG.SUBSCRIBE_PRICING,
      payload: { symbol: "EURUSD" },
    });
    ticks$.next(makeTick("EURUSD"));
    expect(sent).toHaveLength(1);

    messages$.next({
      type: CLIENT_MSG.UNSUBSCRIBE_PRICING,
      payload: { symbol: "EURUSD" },
    });
    expect(ticks$.observed).toBe(false); // inner torn down at refcount 0

    ticks$.next(makeTick("EURUSD")); // post-teardown tick is dropped
    expect(sent).toHaveLength(1);
  });

  it("streams trades as BlotterMessage with SoW flag true only on the first emission", () => {
    const trade = {
      tradeId: 1,
      tradeName: "EUR",
      currencyPair: "EURUSD",
      notional: 1_000_000,
      dealtCurrency: "EUR",
      direction: "Buy",
      spotRate: 1.1,
      status: "Done",
      tradeDate: "2026-07-02",
      valueDate: "2026-07-04",
    };
    const ctx = {
      blotter: {
        getTradeStream: vi.fn(() => {
          return from([[trade], [trade]]);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_BLOTTER, payload: {} });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.BLOTTER,
        payload: { updates: [trade], isStateOfTheWorld: true, isStale: false },
      },
      {
        type: SERVER_MSG.BLOTTER,
        payload: { updates: [trade], isStateOfTheWorld: false, isStale: false },
      },
    ]);
  });

  it("streams position updates as AnalyticsDto on subscribe.analytics", () => {
    const positions = {
      currentPositions: [
        {
          symbol: "EURUSD",
          basePnl: 100,
          baseTradedAmount: 1_000_000,
          counterTradedAmount: 1_100_000,
        },
      ],
      history: [{ timestamp: "2026-07-02T00:00:00Z", usdPnl: 100 }],
    };
    const ctx = {
      analytics: {
        getAnalytics: vi.fn(() => {
          return of(positions);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.SUBSCRIBE_ANALYTICS,
      payload: { currency: "USD" },
    });
    expect(sent).toEqual([{ type: SERVER_MSG.ANALYTICS, payload: positions }]);
    expect(ctx.analytics.getAnalytics).toHaveBeenCalledWith("USD");
  });

  it("acks executeTrade with the ExecutionResponseDto", () => {
    const trade = {
      tradeId: 1,
      tradeName: "EUR",
      currencyPair: "EURUSD",
      notional: 1_000_000,
      dealtCurrency: "EUR",
      direction: "Buy",
      spotRate: 1.1,
      status: "Done",
      tradeDate: "2026-07-02",
      valueDate: "2026-07-04",
    };
    const ctx = {
      execution: {
        executeTrade: vi.fn(() => {
          return of(trade);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.EXECUTE_TRADE,
      payload: {
        currencyPair: "EURUSD",
        spotRate: 1.1,
        direction: "Buy",
        notional: 1_000_000,
        dealtCurrency: "EUR",
      },
      correlationId: "9",
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.EXECUTION_RESPONSE,
        payload: { type: "ack", payload: trade },
        correlationId: "9",
      },
    ]);
  });

  it("acks getPriceHistory with a PriceHistoryDto", () => {
    const prices = [
      {
        symbol: "EURUSD",
        bid: 1.1,
        ask: 1.1002,
        mid: 1.1001,
        valueDate: "2026-07-02",
        creationTimestamp: 1,
      },
    ];
    const ctx = {
      pricing: {
        getPriceHistory: vi.fn(() => {
          return of(prices);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.GET_PRICE_HISTORY,
      payload: { symbol: "EURUSD" },
      correlationId: "3",
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.PRICE_HISTORY_RESPONSE,
        payload: { type: "ack", payload: { prices } },
        correlationId: "3",
      },
    ]);
    expect(ctx.pricing.getPriceHistory).toHaveBeenCalledWith("EURUSD");
  });
});

function makeTick(symbol: string): PriceTick {
  return {
    symbol,
    bid: 1.1,
    ask: 1.1002,
    mid: 1.1001,
    valueDate: "2026-07-02",
    creationTimestamp: 1,
  };
}

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
  createWsListener(combineEffects(...fxEffects), ctx as Ctx)(socket);
  return { messages$, sent };
}
