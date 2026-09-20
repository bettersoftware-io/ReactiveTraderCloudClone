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
import { reportAsync } from "#/kernel/reportAsync";
import { spawn } from "#/kernel/spawn";
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
  let active: AbortController | null = null;
  let disposed = false;

  function endActive(): void {
    active?.abort();
    active = null;
  }

  function runCommand(command: Stream<void>): void {
    if (disposed) {
      return;
    }

    endActive();
    const controller = new AbortController();
    active = controller;
    void spawn(async () => {
      try {
        await once(command, controller.signal);
      } catch (error) {
        if (error instanceof AbortError) {
          throw error;
        }

        store.set(NOT_SUBMITTED);
        return;
      }

      store.set(SUBMITTED);
    }, reportAsync);
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
      disposed = true;
      endActive();
    },
  };
}
