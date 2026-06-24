import { of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { Quote } from "../credit/quote.js";
import type { Rfq } from "../credit/rfq.js";
import { RfqState } from "../credit/rfq.js";
import { Direction } from "../fx/trade.js";
import type { RfqEvent, WorkflowPort } from "../ports/workflowPort.js";
import {
  type RfqStreamState,
  reduceRfqEvent,
  WorkflowEventStreamUseCase,
} from "./WorkflowEventStreamUseCase.js";

function stubWorkflow(events$: Subject<RfqEvent>): WorkflowPort {
  return {
    events: () => {
      return events$.asObservable();
    },
    createRfq: () => {
      return of(0);
    },
    cancelRfq: () => {
      return of(undefined);
    },
    quote: () => {
      return of(undefined);
    },
    pass: () => {
      return of(undefined);
    },
    accept: () => {
      return of(undefined);
    },
  };
}

function emptyState(): RfqStreamState {
  return { rfqs: new Map(), quotes: new Map() };
}

function buildRfq(id: number, state: RfqState = RfqState.Open): Rfq {
  return {
    id,
    instrumentId: 1,
    quantity: 1000,
    direction: Direction.Buy,
    state,
    expirySecs: 120,
    creationTimestamp: 1000,
  };
}

function buildQuote(id: number, rfqId: number, dealerId = 1): Quote {
  return { id, rfqId, dealerId, state: { type: "pendingWithoutPrice" } };
}

describe("reduceRfqEvent", () => {
  it("startOfStateOfTheWorld clears both maps", () => {
    const start: RfqStreamState = {
      rfqs: new Map([[1, buildRfq(1)]]),
      quotes: new Map([[1, buildQuote(1, 1)]]),
    };
    const next = reduceRfqEvent(start, { type: "startOfStateOfTheWorld" });
    expect(next.rfqs.size).toBe(0);
    expect(next.quotes.size).toBe(0);
  });

  it("endOfStateOfTheWorld is a no-op (returns state unchanged)", () => {
    const start: RfqStreamState = {
      rfqs: new Map([[1, buildRfq(1)]]),
      quotes: new Map([[1, buildQuote(1, 1)]]),
    };
    const next = reduceRfqEvent(start, { type: "endOfStateOfTheWorld" });
    expect(next.rfqs.size).toBe(1);
    expect(next.quotes.size).toBe(1);
  });

  it("rfqCreated upserts the rfq into rfqs", () => {
    const rfq = buildRfq(7);
    const next = reduceRfqEvent(emptyState(), {
      type: "rfqCreated",
      payload: rfq,
    });
    expect(next.rfqs.get(7)).toEqual(rfq);
    expect(next.quotes.size).toBe(0);
  });

  it("rfqClosed upserts the (closed) rfq, replacing the open version", () => {
    const open = buildRfq(7, RfqState.Open);
    const closed = buildRfq(7, RfqState.Closed);
    const start: RfqStreamState = {
      rfqs: new Map([[7, open]]),
      quotes: new Map(),
    };
    const next = reduceRfqEvent(start, { type: "rfqClosed", payload: closed });
    expect(next.rfqs.get(7)?.state).toBe(RfqState.Closed);
  });

  it("quoteCreated upserts the quote into quotes", () => {
    const quote = buildQuote(5, 7);
    const next = reduceRfqEvent(emptyState(), {
      type: "quoteCreated",
      payload: quote,
    });
    expect(next.quotes.get(5)).toEqual(quote);
    expect(next.rfqs.size).toBe(0);
  });

  it("quoteQuoted upserts the priced quote, replacing the previous version", () => {
    const pending = buildQuote(5, 7);
    const priced: Quote = {
      ...pending,
      state: { type: "pendingWithPrice", price: 100 },
    };
    const start: RfqStreamState = {
      rfqs: new Map(),
      quotes: new Map([[5, pending]]),
    };
    const next = reduceRfqEvent(start, {
      type: "quoteQuoted",
      payload: priced,
    });
    expect(next.quotes.get(5)?.state).toEqual({
      type: "pendingWithPrice",
      price: 100,
    });
  });

  it("quotePassed upserts the passed quote", () => {
    const passed: Quote = {
      id: 5,
      rfqId: 7,
      dealerId: 1,
      state: { type: "passed" },
    };
    const next = reduceRfqEvent(emptyState(), {
      type: "quotePassed",
      payload: passed,
    });
    expect(next.quotes.get(5)?.state).toEqual({ type: "passed" });
  });

  it("quoteAccepted upserts the accepted quote", () => {
    const accepted: Quote = {
      id: 5,
      rfqId: 7,
      dealerId: 1,
      state: { type: "accepted", price: 100 },
    };
    const next = reduceRfqEvent(emptyState(), {
      type: "quoteAccepted",
      payload: accepted,
    });
    expect(next.quotes.get(5)?.state).toEqual({ type: "accepted", price: 100 });
  });

  it("quoteRejected upserts the rejected quote (rejectedWithPrice)", () => {
    const rejected: Quote = {
      id: 5,
      rfqId: 7,
      dealerId: 1,
      state: { type: "rejectedWithPrice", price: 105 },
    };
    const next = reduceRfqEvent(emptyState(), {
      type: "quoteRejected",
      payload: rejected,
    });
    expect(next.quotes.get(5)?.state).toEqual({
      type: "rejectedWithPrice",
      price: 105,
    });
  });
});

describe("reduceRfqEvent quoteRejected", () => {
  it("flips a losing sibling to rejected in the quotes map", () => {
    const events: RfqEvent[] = [
      { type: "startOfStateOfTheWorld" },
      {
        type: "quoteCreated",
        payload: {
          id: 1,
          rfqId: 9,
          dealerId: 1,
          state: { type: "pendingWithPrice", price: 100 },
        },
      },
      {
        type: "quoteCreated",
        payload: {
          id: 2,
          rfqId: 9,
          dealerId: 2,
          state: { type: "pendingWithPrice", price: 105 },
        },
      },
      {
        type: "quoteAccepted",
        payload: {
          id: 1,
          rfqId: 9,
          dealerId: 1,
          state: { type: "accepted", price: 100 },
        },
      },
      {
        type: "quoteRejected",
        payload: {
          id: 2,
          rfqId: 9,
          dealerId: 2,
          state: { type: "rejectedWithPrice", price: 105 },
        },
      },
    ];
    const state = events.reduce(reduceRfqEvent, {
      rfqs: new Map(),
      quotes: new Map(),
    });
    expect(state.quotes.get(1)?.state).toEqual({
      type: "accepted",
      price: 100,
    });
    expect(state.quotes.get(2)?.state).toEqual({
      type: "rejectedWithPrice",
      price: 105,
    });
  });
});

describe("WorkflowEventStreamUseCase", () => {
  it("yields a snapshot after each event reflecting the cumulative reduction", () => {
    const rfq1 = buildRfq(1);
    const rfq2 = buildRfq(2);
    const quote1 = buildQuote(10, 1);
    const events$ = new Subject<RfqEvent>();
    const useCase = new WorkflowEventStreamUseCase(stubWorkflow(events$));

    const snapshots: RfqStreamState[] = [];
    const sub = useCase.execute().subscribe((s) => {
      return snapshots.push(s);
    });

    events$.next({ type: "startOfStateOfTheWorld" });
    events$.next({ type: "rfqCreated", payload: rfq1 });
    events$.next({ type: "quoteCreated", payload: quote1 });
    events$.next({ type: "rfqCreated", payload: rfq2 });
    events$.next({ type: "endOfStateOfTheWorld" });

    expect(snapshots).toHaveLength(5);
    expect(snapshots[0].rfqs.size).toBe(0); // after startOfSoW
    expect(snapshots[1].rfqs.get(1)).toEqual(rfq1);
    expect(snapshots[2].quotes.get(10)).toEqual(quote1);
    expect(snapshots[3].rfqs.size).toBe(2);
    expect(snapshots[4].rfqs.size).toBe(2); // endOfSoW is a no-op
    expect(snapshots[4].quotes.size).toBe(1);

    sub.unsubscribe();
  });
});
