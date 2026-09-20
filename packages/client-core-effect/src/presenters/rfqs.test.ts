import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { defer, type Observable, of, Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import type { Stream } from "@rtc/core-api";
import {
  CREDIT_QUANTITY_MULTIPLIER,
  type CreateRfqRequest,
  Direction,
  type Quote,
  RFQ_DEFAULT_EXPIRY_SECS,
  type Rfq,
  type RfqEvent,
  RfqState,
  type WorkflowPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createRfqsPresenter } from "#/presenters/rfqs";

describe("createRfqsPresenter", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("rfqs$ appends each created RFQ and stays silent through an event that leaves the roster shallow-equal", async () => {
    const workflow = createWorkflowPort();
    const p = createRfqsPresenter(useHost(), workflow.port);
    const seen = collect(p.rfqs$);
    expect(seen).toEqual([]);
    workflow.events.next(START);
    await settle();
    expect(seen).toEqual([[]]);
    const one = createRfqFixture(1);
    const two = createRfqFixture(2);
    workflow.events.next({ type: "rfqCreated", payload: one });
    await settle();
    workflow.events.next({ type: "rfqCreated", payload: two });
    await settle();
    workflow.events.next(END);
    await settle();
    expect(seen).toEqual([[], [one], [one, two]]);
  });

  it("allQuotes$ ignores an RFQ event, and quotesForRfq$ is memoised per rfq id", async () => {
    const workflow = createWorkflowPort();
    const p = createRfqsPresenter(useHost(), workflow.port);
    expect(p.quotesForRfq$(1)).toBe(p.quotesForRfq$(1));
    const all = collect(p.allQuotes$);
    const forOne = collect(p.quotesForRfq$(1));
    workflow.events.next(START);
    await settle();
    expect(all).toHaveLength(1);
    workflow.events.next({ type: "rfqCreated", payload: createRfqFixture(1) });
    await settle();
    // The quote map is the same reference across an RFQ event, so the
    // `Object.is` guard drops the derivation entirely.
    expect(all).toHaveLength(1);
    const quote = createQuoteFixture(10, 1);
    workflow.events.next({ type: "quoteCreated", payload: quote });
    await settle();
    expect(all).toHaveLength(2);
    expect(forOne.at(-1)).toEqual([quote]);
  });

  it("events$ is the raw event stream and replays the last event to a late joiner", async () => {
    const workflow = createWorkflowPort();
    const p = createRfqsPresenter(useHost(), workflow.port);
    const seen = collect(p.events$);
    const created: RfqEvent = {
      type: "rfqCreated",
      payload: createRfqFixture(1),
    };
    workflow.events.next(START);
    workflow.events.next(created);
    await settle();
    expect(seen).toEqual([START, created]);
    expect(collect(p.events$)).toEqual([created]);
  });

  it("workflow.events() is called ONCE, stays observed across zero subscribers and is released with the host scope", async () => {
    const workflow = createWorkflowPort();
    const host = useHost();
    const p = createRfqsPresenter(host, workflow.port);
    expect(workflow.eventsCalls()).toBe(1);
    expect(workflow.events.observed).toBe(false);
    const first = p.rfqs$.subscribe(() => {});
    workflow.events.next(START);
    await settle();
    expect(workflow.events.observed).toBe(true);
    first.unsubscribe();
    await settle();
    // Retained: the fold that holds the roster outlives its subscribers.
    expect(workflow.events.observed).toBe(true);
    expect(workflow.eventsCalls()).toBe(1);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await settle();
    expect(workflow.events.observed).toBe(false);
  });

  it("createRfq is lazy, maps the UI input to the port request and completes after its one value", async () => {
    const workflow = createWorkflowPort();
    const p = createRfqsPresenter(useHost(), workflow.port);
    const created = p.createRfq({
      instrumentId: 7,
      dealerIds: [1, 2],
      quantity: 5,
      direction: Direction.Sell,
    });
    expect(workflow.createRequests()).toEqual([]);
    const values: number[] = [];
    let completed = false;
    created.subscribe({
      next: (value: number) => {
        values.push(value);
      },
      complete: () => {
        completed = true;
      },
    });
    await settle();
    expect(workflow.createRequests()).toEqual([
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
  });

  it("the two submission machines it builds yield their seed state synchronously", () => {
    const workflow = createWorkflowPort();
    const p = createRfqsPresenter(useHost(), workflow.port);
    const submission = p.createSubmission();
    const ticket = p.createTicketSubmission();
    expect(collect(submission.state$)).toEqual([{ status: "editing" }]);
    expect(collect(ticket.state$)).toEqual([{ submitted: false }]);
    submission.dispose();
    ticket.dispose();
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

/** The workflow port under test: a Subject for `events()`, a counter for the
 * "called once at construction" claim, and per-call recorders for the
 * commands, which register on SUBSCRIBE so laziness stays the core's
 * property. */
interface TestWorkflow {
  port: WorkflowPort;
  events: Subject<RfqEvent>;
  eventsCalls: () => number;
  createRequests: () => readonly CreateRfqRequest[];
}

function createWorkflowPort(): TestWorkflow {
  const events = new Subject<RfqEvent>();
  const createRequests: CreateRfqRequest[] = [];
  let eventsCalls = 0;

  return {
    events,
    eventsCalls: () => {
      return eventsCalls;
    },
    createRequests: () => {
      return createRequests;
    },
    port: {
      events: (): Observable<RfqEvent> => {
        eventsCalls += 1;
        return events;
      },
      createRfq: (request: CreateRfqRequest): Observable<number> => {
        return defer(() => {
          createRequests.push(request);
          return of(42);
        });
      },
      cancelRfq: (): Observable<void> => {
        return of(undefined);
      },
      quote: (): Observable<void> => {
        return of(undefined);
      },
      pass: (): Observable<void> => {
        return of(undefined);
      },
      accept: (): Observable<void> => {
        return of(undefined);
      },
    },
  };
}

function createRfqFixture(id: number): Rfq {
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

function createQuoteFixture(id: number, rfqId: number): Quote {
  return { id, rfqId, dealerId: 1, state: { type: "pendingWithoutPrice" } };
}

function collect<T>(stream: Stream<T>): T[] {
  const values: T[] = [];
  stream.subscribe((value: T) => {
    values.push(value);
  });
  return values;
}

/** Two real macrotask turns: the port → fold → derivation chain delivers on
 * the Effect scheduler, one hop per turn. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 2; turn += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

const START: RfqEvent = { type: "startOfStateOfTheWorld" };

const END: RfqEvent = { type: "endOfStateOfTheWorld" };
