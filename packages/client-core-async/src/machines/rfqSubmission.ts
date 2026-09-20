import type {
  Machine,
  RfqSubmissionIntents,
  RfqSubmissionState,
  Stream,
} from "@rtc/core-api";
import { type CreateRfqInput, RFQ_REDIRECT_DELAY_MS } from "@rtc/domain";

import { once } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { reportAsync } from "#/kernel/reportAsync";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

export interface RfqSubmissionDeps {
  /** The create-RFQ command (`RfqsPresenter.createRfq`). */
  createRfq: (input: CreateRfqInput) => Stream<number>;
}

const EDITING: RfqSubmissionState = { status: "editing" };
const SUBMITTING: RfqSubmissionState = { status: "submitting" };

/** editing → submitting → confirmed{rfqId} → (RFQ_REDIRECT_DELAY_MS)
 * onRedirect(rfqId) → editing; a failed create returns to editing. A new
 * `submit()` aborts the run in flight (the RxJS `switchMap`), which
 * withdraws its port call; `dispose()` aborts it too, so a pending redirect
 * never fires. A consumer that disposes inside `onRedirect` leaves the state
 * at `confirmed`; a superseding `submit()` or `dispose()` aborts the run,
 * which withdraws its port call and drops every later step. */
export function createRfqSubmissionMachine(
  deps: RfqSubmissionDeps,
): Machine<RfqSubmissionState, RfqSubmissionIntents> {
  const store = createStore<RfqSubmissionState>(EDITING);
  let active: AbortController | null = null;
  let disposed = false;

  function endActive(): void {
    active?.abort();
    active = null;
  }

  async function run(
    input: CreateRfqInput,
    onRedirect: (rfqId: number) => void,
    signal: AbortSignal,
  ): Promise<void> {
    store.set(SUBMITTING);
    let rfqId: number;

    try {
      rfqId = await once(deps.createRfq(input), signal);
    } catch (error) {
      if (error instanceof AbortError) {
        throw error;
      }

      store.set(EDITING);
      return;
    }

    store.set({ status: "confirmed", rfqId });
    await sleep(RFQ_REDIRECT_DELAY_MS, signal);

    if (signal.aborted) {
      return;
    }

    onRedirect(rfqId);

    if (signal.aborted) {
      return;
    }

    store.set(EDITING);
  }

  return {
    state$: storeToStateStream(store),
    intents: {
      submit: (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => {
        if (disposed) {
          return;
        }

        endActive();
        const controller = new AbortController();
        active = controller;
        void spawn(() => {
          return run(input, onRedirect, controller.signal);
        }, reportAsync);
      },
    },
    dispose: () => {
      disposed = true;
      endActive();
    },
  };
}
