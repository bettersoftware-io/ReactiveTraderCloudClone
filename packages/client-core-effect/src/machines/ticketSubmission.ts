import { Effect, Exit, Fiber, Scope, SubscriptionRef } from "effect";

import type {
  Machine,
  Stream,
  TicketSubmissionIntents,
  TicketSubmissionState,
} from "@rtc/core-api";
import type { QuoteRequest } from "@rtc/domain";

import {
  createDetachedHost,
  refToStateStream,
  setRefIfChanged,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";

export interface TicketSubmissionDeps {
  quoteRfq: (request: QuoteRequest) => Stream<void>;
  passQuote: (quoteId: number) => Stream<void>;
}

const NOT_SUBMITTED: TicketSubmissionState = { submitted: false };
const SUBMITTED: TicketSubmissionState = { submitted: true };

/** Either intent runs its command; success flips `submitted`, failure
 * leaves it false so the user can retry. A new intent interrupts the
 * command in flight (the RxJS `switchMap`), releasing it through `rpc`'s
 * finalizer; `dispose()` interrupts it and closes the machine's scope. */
export function createTicketSubmissionMachine(
  deps: TicketSubmissionDeps,
): Machine<TicketSubmissionState, TicketSubmissionIntents> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(
    SubscriptionRef.make<TicketSubmissionState>(NOT_SUBMITTED),
  );
  let active: object | null = null;
  let activeFiber: Fiber.RuntimeFiber<void> | null = null;
  let disposed = false;

  function endActive(): void {
    active = null;

    if (activeFiber !== null) {
      Effect.runFork(Fiber.interrupt(activeFiber));
      activeFiber = null;
    }
  }

  function runCommand(command: Stream<void>): void {
    if (disposed) {
      return;
    }

    endActive();
    const token = {};
    active = token;

    function write(next: TicketSubmissionState): Effect.Effect<void> {
      return Effect.suspend(() => {
        return active === token
          ? setRefIfChanged(ref, () => {
              return next;
            })
          : Effect.void;
      });
    }

    activeFiber = host.runtime.runFork(
      rpc(command).pipe(
        Effect.matchEffect({
          onFailure: () => {
            return write(NOT_SUBMITTED);
          },
          onSuccess: () => {
            return write(SUBMITTED);
          },
        }),
      ),
      { scope: host.scope },
    );
  }

  return {
    state$: refToStateStream(host, ref),
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
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };
}
