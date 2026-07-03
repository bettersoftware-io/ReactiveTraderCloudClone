import { BehaviorSubject, EMPTY, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  ConnectionStatus,
  type CurrencyPair,
  Direction,
  ExecutionStatus,
  type Price,
  type RfqEvent,
  RfqState,
} from "@rtc/domain";

import { AnimationDirector, type AnimationIntent } from "../AnimationDirector";
import type { EquityFillSignal } from "../OrdersBlotterPresenter";
import type { ExecutionOutcome } from "../TradeExecutionPresenter";

const EURUSD: CurrencyPair = {
  symbol: "EURUSD",
  base: "EUR",
  terms: "USD",
  ratePrecision: 5,
  pipsPosition: 4,
  defaultNotional: 1_000_000,
  baseMid: 1.09213,
  typicalSpreadPips: 1.4,
};

describe("AnimationDirector", () => {
  it("maps a rising price tick to a tickUp intent on the pair's target", () => {
    const eurusd$ = new Subject<Price>();
    const pairs$ = new BehaviorSubject<readonly CurrencyPair[]>([EURUSD]);
    const status$ = new Subject<ConnectionStatus>();
    const executions$ = new Subject<ExecutionOutcome>();
    const rfqEvents$ = new Subject<RfqEvent>();
    const equityFills$ = new Subject<EquityFillSignal>();

    const director = new AnimationDirector({
      pairs$,
      priceFor: (_pair: CurrencyPair) => {
        return eurusd$;
      },
      connectionStatus$: status$,
      executions$,
      rfqEvents$,
      equityFills$,
    });

    const seen: AnimationIntent[] = [];
    const sub = director.intentsFor("tile:EURUSD").subscribe((i) => {
      return seen.push(i);
    });

    eurusd$.next(makePrice(1.1));
    eurusd$.next(makePrice(1.2));
    sub.unsubscribe();

    expect(seen).toEqual([{ target: "tile:EURUSD", kind: "tickUp" }]);
  });

  it("maps a falling price tick to a tickDown intent", () => {
    const eurusd$ = new Subject<Price>();
    const pairs$ = new BehaviorSubject<readonly CurrencyPair[]>([EURUSD]);
    const status$ = new Subject<ConnectionStatus>();
    const executions$ = new Subject<ExecutionOutcome>();
    const rfqEvents$ = new Subject<RfqEvent>();
    const equityFills$ = new Subject<EquityFillSignal>();

    const director = new AnimationDirector({
      pairs$,
      priceFor: (_pair: CurrencyPair) => {
        return eurusd$;
      },
      connectionStatus$: status$,
      executions$,
      rfqEvents$,
      equityFills$,
    });

    const seen: AnimationIntent[] = [];
    const sub = director.intentsFor("tile:EURUSD").subscribe((i) => {
      return seen.push(i);
    });

    eurusd$.next(makePrice(1.2));
    eurusd$.next(makePrice(1.1));
    sub.unsubscribe();

    expect(seen).toEqual([{ target: "tile:EURUSD", kind: "tickDown" }]);
  });

  it("only emits intents for the requested target (filtered)", () => {
    const eurusd$ = new Subject<Price>();
    const pairs$ = new BehaviorSubject<readonly CurrencyPair[]>([EURUSD]);
    const status$ = new Subject<ConnectionStatus>();
    const executions$ = new Subject<ExecutionOutcome>();
    const rfqEvents$ = new Subject<RfqEvent>();
    const equityFills$ = new Subject<EquityFillSignal>();

    const director = new AnimationDirector({
      pairs$,
      priceFor: (_pair: CurrencyPair) => {
        return eurusd$;
      },
      connectionStatus$: status$,
      executions$,
      rfqEvents$,
      equityFills$,
    });

    const seen: AnimationIntent[] = [];
    const sub = director.intentsFor("tile:GBPUSD").subscribe((i) => {
      return seen.push(i);
    });

    eurusd$.next(makePrice(1.1));
    eurusd$.next(makePrice(1.2));
    sub.unsubscribe();

    expect(seen).toEqual([]);
  });

  it("maps a connection-status change to a connectionChange intent", () => {
    // The real presenters.connection.status$ is a shareReplay(1) stream that
    // replays the CURRENT status on subscribe; the director skip(1)s that
    // replayed value so it animates only REAL changes (not the initial paint).
    // Model that here with a BehaviorSubject-like priming emission, then assert
    // the two subsequent transitions each yield a connectionChange intent.
    const status$ = new BehaviorSubject<ConnectionStatus>(
      ConnectionStatus.CONNECTING,
    );
    const pairs$ = new BehaviorSubject<readonly CurrencyPair[]>([]);
    const executions$ = new Subject<ExecutionOutcome>();
    const rfqEvents$ = new Subject<RfqEvent>();
    const equityFills$ = new Subject<EquityFillSignal>();

    const director = new AnimationDirector({
      pairs$,
      priceFor: (_pair: CurrencyPair) => {
        return EMPTY;
      },
      connectionStatus$: status$,
      executions$,
      rfqEvents$,
      equityFills$,
    });

    const seen: AnimationIntent[] = [];
    const sub = director.intentsFor("banner:connection").subscribe((i) => {
      return seen.push(i);
    });

    status$.next(ConnectionStatus.CONNECTED);
    status$.next(ConnectionStatus.DISCONNECTED);
    sub.unsubscribe();

    expect(seen).toEqual([
      { target: "banner:connection", kind: "connectionChange" },
      { target: "banner:connection", kind: "connectionChange" },
    ]);
  });

  it("emits fill intent on Done FX execution, reject intent on non-Done", () => {
    const pairs$ = new BehaviorSubject<readonly CurrencyPair[]>([]);
    const status$ = new Subject<ConnectionStatus>();
    const executions$ = new Subject<ExecutionOutcome>();
    const rfqEvents$ = new Subject<RfqEvent>();
    const equityFills$ = new Subject<EquityFillSignal>();

    const director = new AnimationDirector({
      pairs$,
      priceFor: (_pair: CurrencyPair) => {
        return EMPTY;
      },
      connectionStatus$: status$,
      executions$,
      rfqEvents$,
      equityFills$,
    });

    const seen: AnimationIntent[] = [];
    const sub = director.intentsFor("tile:EURUSD").subscribe((i) => {
      return seen.push(i);
    });

    executions$.next({ symbol: "EURUSD", status: ExecutionStatus.Done });
    executions$.next({ symbol: "EURUSD", status: ExecutionStatus.Rejected });
    sub.unsubscribe();

    expect(seen).toEqual([
      { target: "tile:EURUSD", kind: "fill" },
      { target: "tile:EURUSD", kind: "reject" },
    ]);
  });

  it("emits reject intent for all non-Done execution statuses (Timeout, CreditExceeded)", () => {
    const pairs$ = new BehaviorSubject<readonly CurrencyPair[]>([]);
    const status$ = new Subject<ConnectionStatus>();
    const executions$ = new Subject<ExecutionOutcome>();
    const rfqEvents$ = new Subject<RfqEvent>();
    const equityFills$ = new Subject<EquityFillSignal>();

    const director = new AnimationDirector({
      pairs$,
      priceFor: (_pair: CurrencyPair) => {
        return EMPTY;
      },
      connectionStatus$: status$,
      executions$,
      rfqEvents$,
      equityFills$,
    });

    const seen: AnimationIntent[] = [];
    const sub = director.intentsFor("tile:EURUSD").subscribe((i) => {
      return seen.push(i);
    });

    executions$.next({ symbol: "EURUSD", status: ExecutionStatus.Timeout });
    executions$.next({
      symbol: "EURUSD",
      status: ExecutionStatus.CreditExceeded,
    });
    sub.unsubscribe();

    expect(seen).toEqual([
      { target: "tile:EURUSD", kind: "reject" },
      { target: "tile:EURUSD", kind: "reject" },
    ]);
  });

  it("emits expiry intent on rfqClosed+Expired, fill on quoteAccepted", () => {
    const pairs$ = new BehaviorSubject<readonly CurrencyPair[]>([]);
    const status$ = new Subject<ConnectionStatus>();
    const executions$ = new Subject<ExecutionOutcome>();
    const rfqEvents$ = new Subject<RfqEvent>();
    const equityFills$ = new Subject<EquityFillSignal>();

    const director = new AnimationDirector({
      pairs$,
      priceFor: (_pair: CurrencyPair) => {
        return EMPTY;
      },
      connectionStatus$: status$,
      executions$,
      rfqEvents$,
      equityFills$,
    });

    const rfq7Seen: AnimationIntent[] = [];
    const sub = director.intentsFor("rfq:7").subscribe((i) => {
      return rfq7Seen.push(i);
    });

    rfqEvents$.next({
      type: "rfqClosed",
      payload: {
        id: 7,
        instrumentId: 1,
        quantity: 1,
        direction: Direction.Buy,
        state: RfqState.Expired,
        expirySecs: 120,
        creationTimestamp: 1,
      },
    });

    rfqEvents$.next({
      type: "quoteAccepted",
      payload: {
        id: 99,
        rfqId: 7,
        dealerId: 1,
        state: { type: "accepted" as const, price: 100 },
      },
    });

    sub.unsubscribe();

    expect(rfq7Seen).toEqual([
      { target: "rfq:7", kind: "expiry" },
      { target: "rfq:7", kind: "fill" },
    ]);
  });

  it("does NOT emit expiry for rfqClosed+Closed or rfqClosed+Cancelled", () => {
    const pairs$ = new BehaviorSubject<readonly CurrencyPair[]>([]);
    const status$ = new Subject<ConnectionStatus>();
    const executions$ = new Subject<ExecutionOutcome>();
    const rfqEvents$ = new Subject<RfqEvent>();
    const equityFills$ = new Subject<EquityFillSignal>();

    const director = new AnimationDirector({
      pairs$,
      priceFor: (_pair: CurrencyPair) => {
        return EMPTY;
      },
      connectionStatus$: status$,
      executions$,
      rfqEvents$,
      equityFills$,
    });

    const seen: AnimationIntent[] = [];
    const sub = director.intentsFor("rfq:5").subscribe((i) => {
      return seen.push(i);
    });

    rfqEvents$.next({
      type: "rfqClosed",
      payload: {
        id: 5,
        instrumentId: 1,
        quantity: 1,
        direction: Direction.Buy,
        state: RfqState.Closed,
        expirySecs: 120,
        creationTimestamp: 1,
      },
    });

    rfqEvents$.next({
      type: "rfqClosed",
      payload: {
        id: 5,
        instrumentId: 1,
        quantity: 1,
        direction: Direction.Buy,
        state: RfqState.Cancelled,
        expirySecs: 120,
        creationTimestamp: 1,
      },
    });

    rfqEvents$.next({
      type: "quoteCreated",
      payload: {
        id: 10,
        rfqId: 5,
        dealerId: 1,
        state: { type: "pendingWithoutPrice" as const },
      },
    });

    rfqEvents$.next({
      type: "rfqCreated",
      payload: {
        id: 5,
        instrumentId: 1,
        quantity: 1,
        direction: Direction.Buy,
        state: RfqState.Open,
        expirySecs: 120,
        creationTimestamp: 1,
      },
    });

    sub.unsubscribe();

    expect(seen).toHaveLength(0);
  });

  it("emits fill intent on ticket:AAPL when equityFills$ fires", () => {
    const pairs$ = new BehaviorSubject<readonly CurrencyPair[]>([]);
    const status$ = new Subject<ConnectionStatus>();
    const executions$ = new Subject<ExecutionOutcome>();
    const rfqEvents$ = new Subject<RfqEvent>();
    const equityFills$ = new Subject<EquityFillSignal>();

    const director = new AnimationDirector({
      pairs$,
      priceFor: (_pair: CurrencyPair) => {
        return EMPTY;
      },
      connectionStatus$: status$,
      executions$,
      rfqEvents$,
      equityFills$,
    });

    const seen: AnimationIntent[] = [];
    const sub = director.intentsFor("ticket:AAPL").subscribe((i) => {
      return seen.push(i);
    });

    equityFills$.next({ symbol: "AAPL" });
    sub.unsubscribe();

    expect(seen).toEqual([{ target: "ticket:AAPL", kind: "fill" }]);
  });
});

function makePrice(mid: number): Price {
  return { symbol: "EURUSD", bid: mid, ask: mid, mid } as Price;
}
