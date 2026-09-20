import { defer, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RfqSubmissionState, Stream } from "@rtc/core-api";
import {
  type CreateRfqInput,
  Direction,
  RFQ_REDIRECT_DELAY_MS,
} from "@rtc/domain";

import { createRfqSubmissionMachine } from "#/machines/rfqSubmission";

describe("createRfqSubmissionMachine (async)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("editing → submitting → confirmed → onRedirect at exactly RFQ_REDIRECT_DELAY_MS → editing", async () => {
    const { deps, calls } = createDeps();
    const m = createRfqSubmissionMachine(deps);
    const seen: RfqSubmissionState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    const redirected: number[] = [];
    expect(seen).toEqual([{ status: "editing" }]);
    m.intents.submit(INPUT, (rfqId: number) => {
      redirected.push(rfqId);
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.inputs).toEqual([INPUT]);
    expect(seen.at(-1)).toEqual({ status: "submitting" });
    calls.results[0]?.next(42);
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.at(-1)).toEqual({ status: "confirmed", rfqId: 42 });
    await vi.advanceTimersByTimeAsync(RFQ_REDIRECT_DELAY_MS - 1);
    expect(redirected).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(redirected).toEqual([42]);
    expect(seen.at(-1)).toEqual({ status: "editing" });
    sub.unsubscribe();
    m.dispose();
  });

  it("a failed create returns to editing with no confirmation and no redirect", async () => {
    const { deps, calls } = createDeps();
    const m = createRfqSubmissionMachine(deps);
    const seen: RfqSubmissionState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    const redirected: number[] = [];
    m.intents.submit(INPUT, (rfqId: number) => {
      redirected.push(rfqId);
    });
    await vi.advanceTimersByTimeAsync(0);
    calls.results[0]?.error(new Error("bust"));
    await vi.advanceTimersByTimeAsync(RFQ_REDIRECT_DELAY_MS);
    expect(statuses(seen)).toEqual(["editing", "submitting", "editing"]);
    expect(redirected).toEqual([]);
    sub.unsubscribe();
    m.dispose();
  });

  it("dispose() before the delay cancels the redirect", async () => {
    const { deps, calls } = createDeps();
    const m = createRfqSubmissionMachine(deps);
    const sub = m.state$.subscribe(() => {});
    const redirected: number[] = [];
    m.intents.submit(INPUT, (rfqId: number) => {
      redirected.push(rfqId);
    });
    await vi.advanceTimersByTimeAsync(0);
    calls.results[0]?.next(5);
    await vi.advanceTimersByTimeAsync(0);
    sub.unsubscribe();
    m.dispose();
    await vi.advanceTimersByTimeAsync(RFQ_REDIRECT_DELAY_MS);
    expect(redirected).toEqual([]);
  });

  it("a consumer that disposes from INSIDE onRedirect gets no post-dispose write: the state the redirect left stands", async () => {
    const { deps, calls } = createDeps();
    let m: ReturnType<typeof createRfqSubmissionMachine> | null = null;
    const redirected: number[] = [];
    m = createRfqSubmissionMachine(deps);
    const seen: RfqSubmissionState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    m.intents.submit(INPUT, (rfqId: number) => {
      redirected.push(rfqId);
      m?.dispose();
    });
    await vi.advanceTimersByTimeAsync(0);
    calls.results[0]?.next(42);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(RFQ_REDIRECT_DELAY_MS);
    expect(redirected).toEqual([42]);
    expect(seen.at(-1)).toEqual({ status: "confirmed", rfqId: 42 });
    sub.unsubscribe();
  });

  it("dispose() makes submit() inert: no port call, no further state", async () => {
    const { deps, calls } = createDeps();
    const m = createRfqSubmissionMachine(deps);
    const sub = m.state$.subscribe(() => {});
    sub.unsubscribe();
    m.dispose();
    m.intents.submit(INPUT, () => {});
    await vi.advanceTimersByTimeAsync(RFQ_REDIRECT_DELAY_MS);
    expect(calls.inputs).toEqual([]);
    const fresh: RfqSubmissionState[] = [];
    m.state$
      .subscribe((state) => {
        fresh.push(state);
      })
      .unsubscribe();
    expect(fresh).toEqual([{ status: "editing" }]);
  });

  interface CreateRfqCalls {
    inputs: CreateRfqInput[];
    results: Subject<number>[];
  }

  interface CreateRfqDeps {
    createRfq: (input: CreateRfqInput) => Stream<number>;
  }

  interface DepsFixture {
    deps: CreateRfqDeps;
    calls: CreateRfqCalls;
  }

  function statuses(values: readonly RfqSubmissionState[]): string[] {
    return values.map((state) => {
      return state.status;
    });
  }

  function createDeps(): DepsFixture {
    const calls: CreateRfqCalls = { inputs: [], results: [] };
    return {
      calls,
      deps: {
        createRfq: (input: CreateRfqInput) => {
          return defer(() => {
            calls.inputs.push(input);
            const results = new Subject<number>();
            calls.results.push(results);
            return results;
          });
        },
      },
    };
  }
});

const INPUT: CreateRfqInput = {
  instrumentId: 1,
  dealerIds: [1],
  quantity: 1,
  direction: Direction.Buy,
};
