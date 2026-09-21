import type {
  Machine,
  Stream,
  TicketSubmissionIntents,
  TicketSubmissionState,
} from "@rtc/core-api";
import type { QuoteRequest } from "@rtc/domain";

import { once } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { createRunSlot } from "#/kernel/runSlot";
import { createStore } from "#/kernel/store";

export interface TicketSubmissionDeps {
  quoteRfq: (request: QuoteRequest) => Stream<void>;
  passQuote: (quoteId: number) => Stream<void>;
}

const NOT_SUBMITTED: TicketSubmissionState = { submitted: false };
const SUBMITTED: TicketSubmissionState = { submitted: true };

/** Either intent runs its command; success flips `submitted`, failure
 * leaves it false so the user can retry. A new intent aborts the command
 * in flight (the RxJS `switchMap`); `dispose()` aborts it. */
export function createTicketSubmissionMachine(
  deps: TicketSubmissionDeps,
): Machine<TicketSubmissionState, TicketSubmissionIntents> {
  const store = createStore<TicketSubmissionState>(NOT_SUBMITTED);
  const slot = createRunSlot(store);

  function runCommand(command: Stream<void>): void {
    slot.start(async (run) => {
      try {
        await once(command, run.signal);
      } catch (error) {
        if (error instanceof AbortError) {
          throw error;
        }

        run.set(NOT_SUBMITTED);
        return;
      }

      run.set(SUBMITTED);
    });
  }

  return {
    state$: storeToStateStream(store),
    intents: {
      submitPrice: (quoteId: number, price: number) => {
        runCommand(deps.quoteRfq({ quoteId, price }));
      },
      pass: (quoteId: number) => {
        runCommand(deps.passQuote(quoteId));
      },
    },
    dispose: () => {
      slot.dispose();
    },
  };
}
