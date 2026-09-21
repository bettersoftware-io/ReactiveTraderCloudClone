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
import { createRunSlot, type Run } from "#/kernel/runSlot";
import { sleep } from "#/kernel/sleep";
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
  const slot = createRunSlot(store);

  async function submitRfq(
    input: CreateRfqInput,
    onRedirect: (rfqId: number) => void,
    run: Run<RfqSubmissionState>,
  ): Promise<void> {
    run.set(SUBMITTING);
    let rfqId: number;

    try {
      rfqId = await once(deps.createRfq(input), run.signal);
    } catch (error) {
      if (error instanceof AbortError) {
        throw error;
      }

      run.set(EDITING);
      return;
    }

    run.set({ status: "confirmed", rfqId });
    await sleep(RFQ_REDIRECT_DELAY_MS, run.signal);
    // Through the run, like a write: a consumer that disposes INSIDE the
    // callback aborts this run, and the trailing `editing` is then dropped —
    // the machine stays `confirmed`, as the Effect twin does (slice 3 R11).
    run.ifCurrent(() => {
      onRedirect(rfqId);
    });
    run.set(EDITING);
  }

  return {
    state$: storeToStateStream(store),
    intents: {
      submit: (input: CreateRfqInput, onRedirect: (rfqId: number) => void) => {
        slot.start((run) => {
          return submitRfq(input, onRedirect, run);
        });
      },
    },
    dispose: () => {
      slot.dispose();
    },
  };
}
