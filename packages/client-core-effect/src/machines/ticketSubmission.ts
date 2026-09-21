import { Effect, SubscriptionRef } from "effect";

import type {
  Machine,
  Stream,
  TicketSubmissionIntents,
  TicketSubmissionState,
} from "@rtc/core-api";
import type { QuoteRequest } from "@rtc/domain";

import { createDetachedHost, refToStateStream } from "#/bridge/out";
import { rpc } from "#/bridge/rpc";
import { createRunSlot, type Run } from "#/machines/runSlot";

export interface TicketSubmissionDeps {
  quoteRfq: (request: QuoteRequest) => Stream<void>;
  passQuote: (quoteId: number) => Stream<void>;
}

const NOT_SUBMITTED: TicketSubmissionState = { submitted: false };
const SUBMITTED: TicketSubmissionState = { submitted: true };

function runCommand(
  command: Stream<void>,
  run: Run<TicketSubmissionState>,
): Effect.Effect<void> {
  return rpc(command).pipe(
    Effect.matchEffect({
      onFailure: () => {
        return run.write(() => {
          return NOT_SUBMITTED;
        });
      },
      onSuccess: () => {
        return run.write(() => {
          return SUBMITTED;
        });
      },
    }),
  );
}

/** Either intent runs its command; success flips `submitted`, failure
 * leaves it false so the user can retry. A new intent supersedes the
 * command in flight (`createRunSlot`'s switch-map semantics), releasing it
 * through `rpc`'s finalizer; `dispose()` ends it and closes the machine's
 * scope. */
export function createTicketSubmissionMachine(
  deps: TicketSubmissionDeps,
): Machine<TicketSubmissionState, TicketSubmissionIntents> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(
    SubscriptionRef.make<TicketSubmissionState>(NOT_SUBMITTED),
  );
  const slot = createRunSlot(host, ref);

  function submit(command: Stream<void>): void {
    if (slot.isDisposed()) {
      return;
    }

    slot.start((run: Run<TicketSubmissionState>) => {
      return runCommand(command, run);
    });
  }

  return {
    state$: refToStateStream(host, ref),
    intents: {
      submitPrice: (quoteId: number, price: number) => {
        submit(deps.quoteRfq({ quoteId, price }));
      },
      pass: (quoteId: number) => {
        submit(deps.passQuote(quoteId));
      },
    },
    dispose: () => {
      slot.dispose();
    },
  };
}
