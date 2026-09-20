import { defer, type Observable, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RfqSubmissionState, Stream } from "@rtc/core-api";
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
      live.next(rfqId);
      live.complete();
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
