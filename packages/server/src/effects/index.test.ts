import { of, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";
import { combineEffects, createWsListener } from "@rtc/ws-effects";

import type { Ctx } from "./context.js";
import { allEffects } from "./index.js";

describe("allEffects composition", () => {
  it("routes one representative message from each domain (fx, credit, admin, equities) to an outbound frame", () => {
    const tick = {
      symbol: "EURUSD",
      bid: 1.1,
      ask: 1.1002,
      mid: 1.1001,
      valueDate: "2026-07-02",
      creationTimestamp: 1,
    };
    const watchlist = [{ symbol: "AAPL" }];
    const ctx = {
      pricing: {
        getPriceUpdates: vi.fn(() => {
          return of(tick);
        }),
      },
      instruments: {
        getInstruments: vi.fn(() => {
          return of([]);
        }),
      },
      throughput: {
        getThroughput: vi.fn(() => {
          return 100;
        }),
      },
      marketData: {
        watchlist: vi.fn(() => {
          return of(watchlist);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);

    messages$.next({
      type: CLIENT_MSG.SUBSCRIBE_PRICING,
      payload: { symbol: "EURUSD" },
    });
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_INSTRUMENTS, payload: {} });
    messages$.next({
      type: CLIENT_MSG.GET_THROUGHPUT,
      payload: {},
      correlationId: "1",
    });
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_WATCHLIST, payload: {} });

    expect(sent).toContainEqual({ type: SERVER_MSG.PRICE_TICK, payload: tick });
    expect(sent).toContainEqual({
      type: SERVER_MSG.INSTRUMENT_EVENT,
      payload: { type: "startOfStateOfTheWorld" },
    });
    expect(sent).toContainEqual({
      type: SERVER_MSG.THROUGHPUT_RESPONSE,
      payload: { type: "ack", payload: 100 },
      correlationId: "1",
    });
    expect(sent).toContainEqual({
      type: SERVER_MSG.WATCHLIST,
      payload: watchlist,
    });
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
  createWsListener(combineEffects(...allEffects), ctx as Ctx)(socket);
  return { messages$, sent };
}
