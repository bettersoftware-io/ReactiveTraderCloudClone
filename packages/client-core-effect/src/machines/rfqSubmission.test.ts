import { defer, type Observable, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Machine,
  RfqSubmissionIntents,
  RfqSubmissionState,
  Stream,
} from "@rtc/core-api";
import {
  type CreateRfqInput,
  Direction,
  RFQ_REDIRECT_DELAY_MS,
} from "@rtc/domain";

import { createRfqSubmissionMachine } from "#/machines/rfqSubmission";

describe("createRfqSubmissionMachine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("editing → submitting → confirmed, then onRedirect at exactly RFQ_REDIRECT_DELAY_MS and back to editing", async () => {
    const creates = createCreateRfqCommand();
    const m = createRfqSubmissionMachine(creates.deps);
    const seen = collect(m.state$);
    const onRedirect = vi.fn();
    expect(seen).toEqual([{ status: "editing" }]);
    m.intents.submit(INPUT, onRedirect);
    await settle();
    expect(creates.inputs()).toEqual([INPUT]);
    expect(seen.at(-1)).toEqual({ status: "submitting" });
    creates.resolve(42);
    await settle();
    expect(seen.at(-1)).toEqual({ status: "confirmed", rfqId: 42 });
    await vi.advanceTimersByTimeAsync(RFQ_REDIRECT_DELAY_MS - 1);
    await settle();
    expect(onRedirect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(onRedirect).toHaveBeenCalledWith(42);
    expect(seen.at(-1)).toEqual({ status: "editing" });
    m.dispose();
  });

  it("a failing create returns to editing with no confirmation and no redirect", async () => {
    const creates = createCreateRfqCommand();
    const m = createRfqSubmissionMachine(creates.deps);
    const seen = collect(m.state$);
    const onRedirect = vi.fn();
    m.intents.submit(INPUT, onRedirect);
    await settle();
    creates.fail(new Error("bust"));
    await settle();
    expect(seen.at(-1)).toEqual({ status: "editing" });
    expect(
      seen.some((state) => {
        return state.status === "confirmed";
      }),
    ).toBe(false);
    await vi.advanceTimersByTimeAsync(RFQ_REDIRECT_DELAY_MS);
    await settle();
    expect(onRedirect).not.toHaveBeenCalled();
    m.dispose();
  });

  it("dispose() before the delay cancels the redirect, and a later submit() is inert", async () => {
    const creates = createCreateRfqCommand();
    const m = createRfqSubmissionMachine(creates.deps);
    const onRedirect = vi.fn();
    m.intents.submit(INPUT, onRedirect);
    await settle();
    creates.resolve(5);
    await settle();
    m.dispose();
    await vi.advanceTimersByTimeAsync(RFQ_REDIRECT_DELAY_MS);
    await settle();
    expect(onRedirect).not.toHaveBeenCalled();
    m.intents.submit(INPUT, onRedirect);
    await settle();
    expect(creates.inputs()).toHaveLength(1);
  });

  it("dispose() in the SAME turn the redirect timer fires still cancels the callback", async () => {
    const creates = createCreateRfqCommand();
    const m = createRfqSubmissionMachine(creates.deps);
    const onRedirect = vi.fn();
    m.intents.submit(INPUT, onRedirect);
    await settle();
    creates.resolve(42);
    await settle();
    // SYNCHRONOUS advance, deliberately: the timer fires and the run's
    // continuation is queued on the scheduler but has NOT run — the window
    // `advanceTimersByTimeAsync` would close by flushing it first. MEASURED
    // with a probe on effect 3.22.2: in exactly this window the callback is
    // still pending (no calls), and it fires on the next settle when the
    // machine is left alone. Disposing here is therefore the real race, and
    // the outcome asserted below is what BOTH the forked interrupt and the
    // run-token guard on the callback promise.
    vi.advanceTimersByTime(RFQ_REDIRECT_DELAY_MS);
    m.dispose();
    await settle();
    expect(onRedirect).not.toHaveBeenCalled();
  });

  it("a second submit() in that same turn supersedes the redirect: only the surviving run navigates", async () => {
    const creates = createCreateRfqCommand();
    const m = createRfqSubmissionMachine(creates.deps);
    const onRedirect = vi.fn();
    m.intents.submit(INPUT, onRedirect);
    await settle();
    creates.resolve(42);
    await settle();
    vi.advanceTimersByTime(RFQ_REDIRECT_DELAY_MS);
    m.intents.submit(INPUT, onRedirect);
    await settle();
    expect(onRedirect).not.toHaveBeenCalled();
    creates.resolve(7);
    await settle();
    await vi.advanceTimersByTimeAsync(RFQ_REDIRECT_DELAY_MS);
    await settle();
    expect(onRedirect.mock.calls).toEqual([[7]]);
    m.dispose();
  });

  it("a consumer that disposes from INSIDE onRedirect gets no post-dispose write: the state the redirect left stands", async () => {
    const creates = createCreateRfqCommand();
    let m: Machine<RfqSubmissionState, RfqSubmissionIntents> | null = null;
    // The real shape: onRedirect navigates, the form unmounts, `useMachine`
    // disposes — all inside the callback, so the run is superseded WHILE it
    // is running, which no interrupt can undo. Only the run-token guard on
    // the step after the callback can.
    const onRedirect = vi.fn(() => {
      m?.dispose();
    });
    m = createRfqSubmissionMachine(creates.deps);
    const seen = collect(m.state$);
    m.intents.submit(INPUT, onRedirect);
    await settle();
    creates.resolve(42);
    await settle();
    await vi.advanceTimersByTimeAsync(RFQ_REDIRECT_DELAY_MS);
    await settle();
    expect(onRedirect).toHaveBeenCalledWith(42);
    expect(seen.at(-1)).toEqual({ status: "confirmed", rfqId: 42 });
  });
});

interface TestCreateRfq {
  deps: {
    createRfq: (input: CreateRfqInput) => Observable<number>;
  };
  inputs: () => readonly CreateRfqInput[];
  resolve: (rfqId: number) => void;
  fail: (error: unknown) => void;
}

/** The injected `createRfq` command as a `defer`-wrapped Subject: recorded
 * on SUBSCRIBE, settled by the test. */
function createCreateRfqCommand(): TestCreateRfq {
  const inputs: CreateRfqInput[] = [];
  let live = new Subject<number>();

  return {
    deps: {
      createRfq: (input: CreateRfqInput) => {
        return defer(() => {
          inputs.push(input);
          return live;
        });
      },
    },
    inputs: () => {
      return inputs;
    },
    resolve: (rfqId: number) => {
      const settled = live;
      // Replaced before the emission, so a run started in the SAME turn as
      // this settle subscribes a fresh Subject rather than a completed one
      // (which `rpc` would report as "completed without a value").
      live = new Subject<number>();
      settled.next(rfqId);
      settled.complete();
    },
    fail: (error: unknown) => {
      live.error(error);
      live = new Subject<number>();
    },
  };
}

function collect(stream: Stream<RfqSubmissionState>): RfqSubmissionState[] {
  const values: RfqSubmissionState[] = [];
  stream.subscribe((value: RfqSubmissionState) => {
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

const INPUT: CreateRfqInput = {
  instrumentId: 1,
  dealerIds: [1],
  quantity: 1,
  direction: Direction.Buy,
};
