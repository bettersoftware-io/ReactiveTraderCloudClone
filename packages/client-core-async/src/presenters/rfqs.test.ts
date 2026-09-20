import { of, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  CREDIT_QUANTITY_MULTIPLIER,
  type CreateRfqRequest,
  Direction,
  type Quote,
  type QuoteRequest,
  RFQ_DEFAULT_EXPIRY_SECS,
  type Rfq,
  type RfqEvent,
  RfqState,
  type WorkflowPort,
} from "@rtc/domain";

import { createRfqsPresenter } from "#/presenters/rfqs";

describe("createRfqsPresenter (async)", () => {
  it("rfqs$ appends one roster per RFQ event and suppresses the shallow-equal end-of-world", () => {
    const { port, events } = createWorkflowPort();
    const lifetime = new AbortController();
    const presenter = createRfqsPresenter(port, lifetime.signal);
    const seen: (readonly Rfq[])[] = [];
    const sub = presenter.rfqs$.subscribe((rfqs) => {
      seen.push(rfqs);
    });
    // Every value below is asserted WITHOUT awaiting: measured on the first
    // green run — the topic relays its port synchronously (`relay`), so a
    // subscriber sees each event's roster in the tick that pushed it. An
    // awaited variant would pass too; this one also pins the warmth.
    expect(seen).toEqual([]);
    events.next(START);
    const one = createOpenRfq(1);
    const two = createOpenRfq(2);
    events.next({ type: "rfqCreated", payload: one });
    events.next({ type: "rfqCreated", payload: two });
    events.next(END);
    expect(seen).toEqual([[], [one], [one, two]]);
    sub.unsubscribe();
    lifetime.abort();
  });

  it("allQuotes$ stays silent through an RFQ event, and quotesForRfq$ is memoised per id", () => {
    const { port, events } = createWorkflowPort();
    const lifetime = new AbortController();
    const presenter = createRfqsPresenter(port, lifetime.signal);
    expect(presenter.quotesForRfq$(1)).toBe(presenter.quotesForRfq$(1));
    const seen: ReadonlyMap<number, Quote>[] = [];
    const sub = presenter.allQuotes$.subscribe((quotes) => {
      seen.push(quotes);
    });
    events.next(START);
    events.next({ type: "rfqCreated", payload: createOpenRfq(1) });
    // The reducer hands an rfq event the SAME quote map, so the reference
    // check drops it — the RxJS `distinctUntilChanged()` on `allQuotes$`.
    expect(seen).toHaveLength(1);
    const quote: Quote = {
      id: 10,
      rfqId: 1,
      dealerId: 1,
      state: { type: "pendingWithoutPrice" },
    };
    events.next({ type: "quoteCreated", payload: quote });
    expect(seen).toHaveLength(2);
    expect([...(seen.at(-1)?.entries() ?? [])]).toEqual([[10, quote]]);
    sub.unsubscribe();
    lifetime.abort();
  });

  it("events$ replays the last raw event to a late joiner", () => {
    const { port, events } = createWorkflowPort();
    const lifetime = new AbortController();
    const presenter = createRfqsPresenter(port, lifetime.signal);
    const first: RfqEvent[] = [];
    const sub = presenter.events$.subscribe((event) => {
      first.push(event);
    });

    const created: RfqEvent = {
      type: "rfqCreated",
      payload: createOpenRfq(1),
    };
    events.next(START);
    events.next(created);
    expect(first).toEqual([START, created]);
    const late: RfqEvent[] = [];
    presenter.events$
      .subscribe((event) => {
        late.push(event);
      })
      .unsubscribe();
    expect(late).toEqual([created]);
    sub.unsubscribe();
    lifetime.abort();
  });

  it("calls workflow.events() once, retains the subscription across zero subscribers, and releases it on the lifetime abort", () => {
    const { port, events, calls } = createWorkflowPort();
    const lifetime = new AbortController();
    const presenter = createRfqsPresenter(port, lifetime.signal);
    expect(calls.events).toBe(1);
    expect(events.observed).toBe(false);
    presenter.rfqs$.subscribe(() => {}).unsubscribe();
    expect(calls.events).toBe(1);
    expect(events.observed).toBe(true);
    lifetime.abort();
    expect(events.observed).toBe(false);
  });

  it("createRfq maps the UI input to the port request and completes after its one value", async () => {
    const { port, calls } = createWorkflowPort();
    const lifetime = new AbortController();
    const presenter = createRfqsPresenter(port, lifetime.signal);
    const created = presenter.createRfq({
      instrumentId: 7,
      dealerIds: [1, 2],
      quantity: 5,
      direction: Direction.Sell,
    });
    expect(calls.createRfq).toEqual([]);
    const values: number[] = [];
    let completed = false;
    created.subscribe({
      next: (rfqId: number) => {
        values.push(rfqId);
      },
      complete: () => {
        completed = true;
      },
    });
    await flushMicrotasks();
    expect(calls.createRfq).toEqual([
      {
        instrumentId: 7,
        dealerIds: [1, 2],
        quantity: 5 * CREDIT_QUANTITY_MULTIPLIER,
        direction: Direction.Sell,
        expirySecs: RFQ_DEFAULT_EXPIRY_SECS,
      },
    ]);
    expect(values).toEqual([42]);
    expect(completed).toBe(true);
    lifetime.abort();
  });

  it("createSubmission and createTicketSubmission hand back machines carrying their seed synchronously", () => {
    const { port } = createWorkflowPort();
    const lifetime = new AbortController();
    const presenter = createRfqsPresenter(port, lifetime.signal);
    const submission = presenter.createSubmission();
    const ticket = presenter.createTicketSubmission();
    const submissionStates: unknown[] = [];
    const ticketStates: unknown[] = [];
    submission.state$
      .subscribe((state) => {
        submissionStates.push(state);
      })
      .unsubscribe();
    ticket.state$
      .subscribe((state) => {
        ticketStates.push(state);
      })
      .unsubscribe();
    expect(submissionStates).toEqual([{ status: "editing" }]);
    expect(ticketStates).toEqual([{ submitted: false }]);
    submission.dispose();
    ticket.dispose();
    lifetime.abort();
  });

  /** What each command method of the fake port was handed, in order. */
  interface WorkflowCalls {
    events: number;
    createRfq: CreateRfqRequest[];
    accept: number[];
    cancelRfq: number[];
    pass: number[];
    quote: QuoteRequest[];
  }

  interface WorkflowFixture {
    port: WorkflowPort;
    events: Subject<RfqEvent>;
    calls: WorkflowCalls;
  }

  async function flushMicrotasks(): Promise<void> {
    for (let turn = 0; turn < 4; turn += 1) {
      await Promise.resolve();
    }
  }

  function createOpenRfq(id: number): Rfq {
    return {
      id,
      instrumentId: 1,
      quantity: 1_000_000,
      direction: Direction.Buy,
      state: RfqState.Open,
      expirySecs: 120,
      creationTimestamp: 0,
    };
  }

  function createWorkflowPort(): WorkflowFixture {
    const events = new Subject<RfqEvent>();
    const calls: WorkflowCalls = {
      events: 0,
      createRfq: [],
      accept: [],
      cancelRfq: [],
      pass: [],
      quote: [],
    };
    return {
      events,
      calls,
      port: {
        events: () => {
          calls.events += 1;
          return events;
        },
        createRfq: (request: CreateRfqRequest) => {
          calls.createRfq.push(request);
          return of(42);
        },
        accept: (quoteId: number) => {
          calls.accept.push(quoteId);
          return of(undefined);
        },
        cancelRfq: (rfqId: number) => {
          calls.cancelRfq.push(rfqId);
          return of(undefined);
        },
        pass: (quoteId: number) => {
          calls.pass.push(quoteId);
          return of(undefined);
        },
        quote: (request: QuoteRequest) => {
          calls.quote.push(request);
          return of(undefined);
        },
      },
    };
  }
});

const START: RfqEvent = { type: "startOfStateOfTheWorld" };
const END: RfqEvent = { type: "endOfStateOfTheWorld" };
