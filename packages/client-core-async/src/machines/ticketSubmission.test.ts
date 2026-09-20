import { defer, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Stream, TicketSubmissionState } from "@rtc/core-api";
import type { QuoteRequest } from "@rtc/domain";

import { createTicketSubmissionMachine } from "#/machines/ticketSubmission";

describe("createTicketSubmissionMachine (async)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submitPrice() quotes the RFQ and flips submitted once the command completes", async () => {
    const { deps, calls } = createDeps();
    const m = createTicketSubmissionMachine(deps);
    const seen: TicketSubmissionState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    expect(seen).toEqual([{ submitted: false }]);
    m.intents.submitPrice(7, 101.5);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.quotes).toEqual([{ quoteId: 7, price: 101.5 }]);
    expect(seen.at(-1)).toEqual({ submitted: false });
    calls.results[0]?.next(undefined);
    calls.results[0]?.complete();
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.at(-1)).toEqual({ submitted: true });
    sub.unsubscribe();
    m.dispose();
  });

  it("pass() passes the quote by id", async () => {
    const { deps, calls } = createDeps();
    const m = createTicketSubmissionMachine(deps);
    const seen: TicketSubmissionState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    m.intents.pass(8);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.passes).toEqual([8]);
    expect(calls.quotes).toEqual([]);
    calls.results[0]?.next(undefined);
    calls.results[0]?.complete();
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.at(-1)).toEqual({ submitted: true });
    sub.unsubscribe();
    m.dispose();
  });

  it("a failed command leaves submitted false, so the user can retry", async () => {
    const { deps, calls } = createDeps();
    const m = createTicketSubmissionMachine(deps);
    const seen: TicketSubmissionState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    m.intents.submitPrice(7, 101.5);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.results).toHaveLength(1);
    calls.results[0]?.error(new Error("bust"));
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([{ submitted: false }]);
    sub.unsubscribe();
    m.dispose();
  });

  it("dispose() makes the intents inert: no port call, no further state", async () => {
    const { deps, calls } = createDeps();
    const m = createTicketSubmissionMachine(deps);
    const sub = m.state$.subscribe(() => {});
    sub.unsubscribe();
    m.dispose();
    m.intents.submitPrice(7, 101.5);
    m.intents.pass(8);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.quotes).toEqual([]);
    expect(calls.passes).toEqual([]);
    const fresh: TicketSubmissionState[] = [];
    m.state$
      .subscribe((state) => {
        fresh.push(state);
      })
      .unsubscribe();
    expect(fresh).toEqual([{ submitted: false }]);
  });

  interface CommandCalls {
    quotes: QuoteRequest[];
    passes: number[];
    results: Subject<void>[];
  }

  interface CommandDeps {
    quoteRfq: (request: QuoteRequest) => Stream<void>;
    passQuote: (quoteId: number) => Stream<void>;
  }

  interface DepsFixture {
    deps: CommandDeps;
    calls: CommandCalls;
  }

  function createDeps(): DepsFixture {
    const calls: CommandCalls = { quotes: [], passes: [], results: [] };

    function openResult(): Subject<void> {
      const results = new Subject<void>();
      calls.results.push(results);
      return results;
    }

    return {
      calls,
      deps: {
        quoteRfq: (request: QuoteRequest) => {
          return defer(() => {
            calls.quotes.push(request);
            return openResult();
          });
        },
        passQuote: (quoteId: number) => {
          return defer(() => {
            calls.passes.push(quoteId);
            return openResult();
          });
        },
      },
    };
  }
});
