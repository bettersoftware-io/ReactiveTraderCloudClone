import { defer, type Observable, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Stream, TicketSubmissionState } from "@rtc/core-api";
import type { QuoteRequest } from "@rtc/domain";

import { createTicketSubmissionMachine } from "#/machines/ticketSubmission";

describe("createTicketSubmissionMachine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submitPrice() quotes the RFQ and flips submitted when the command completes", async () => {
    const commands = createSubmissionCommands();
    const m = createTicketSubmissionMachine(commands.deps);
    const seen = collect(m.state$);
    expect(seen).toEqual([{ submitted: false }]);
    m.intents.submitPrice(7, 101.5);
    await settle();
    expect(commands.quotes()).toEqual([{ quoteId: 7, price: 101.5 }]);
    expect(seen.at(-1)).toEqual({ submitted: false });
    commands.resolve();
    await settle();
    expect(seen.at(-1)).toEqual({ submitted: true });
    m.dispose();
  });

  it("pass() passes the quote and flips submitted the same way", async () => {
    const commands = createSubmissionCommands();
    const m = createTicketSubmissionMachine(commands.deps);
    const seen = collect(m.state$);
    m.intents.pass(8);
    await settle();
    expect(commands.passed()).toEqual([8]);
    commands.resolve();
    await settle();
    expect(seen.at(-1)).toEqual({ submitted: true });
    m.dispose();
  });

  it("a failing command leaves submitted false, and dispose() releases the one in flight", async () => {
    const commands = createSubmissionCommands();
    const m = createTicketSubmissionMachine(commands.deps);
    const seen = collect(m.state$);
    m.intents.submitPrice(7, 101.5);
    await settle();
    commands.fail(new Error("bust"));
    await settle();
    expect(
      seen.every((state) => {
        return !state.submitted;
      }),
    ).toBe(true);
    m.intents.pass(8);
    await settle();
    expect(commands.observed()).toBe(true);
    m.dispose();
    await settle();
    expect(commands.observed()).toBe(false);
    m.intents.pass(9);
    await settle();
    expect(commands.passed()).toEqual([8]);
  });
});

interface TestSubmissionCommands {
  deps: {
    quoteRfq: (request: QuoteRequest) => Observable<void>;
    passQuote: (quoteId: number) => Observable<void>;
  };
  quotes: () => readonly QuoteRequest[];
  passed: () => readonly number[];
  observed: () => boolean;
  resolve: () => void;
  fail: (error: unknown) => void;
}

/** Both commands over one `defer`-wrapped Subject: each is recorded on
 * SUBSCRIBE, and `observed` is the witness that an interrupted run released
 * the command it had in flight. */
function createSubmissionCommands(): TestSubmissionCommands {
  const quotes: QuoteRequest[] = [];
  const passed: number[] = [];
  let live = new Subject<void>();

  return {
    deps: {
      quoteRfq: (request: QuoteRequest) => {
        return defer(() => {
          quotes.push(request);
          return live;
        });
      },
      passQuote: (quoteId: number) => {
        return defer(() => {
          passed.push(quoteId);
          return live;
        });
      },
    },
    quotes: () => {
      return quotes;
    },
    passed: () => {
      return passed;
    },
    observed: () => {
      return live.observed;
    },
    resolve: () => {
      live.next();
      live.complete();
    },
    fail: (error: unknown) => {
      live.error(error);
      live = new Subject<void>();
    },
  };
}

function collect(
  stream: Stream<TicketSubmissionState>,
): TicketSubmissionState[] {
  const values: TicketSubmissionState[] = [];
  stream.subscribe((value: TicketSubmissionState) => {
    values.push(value);
  });
  return values;
}

/** Two zero-length advances: no time moves, the microtask continuations an
 * Effect fiber resumes on do. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}
