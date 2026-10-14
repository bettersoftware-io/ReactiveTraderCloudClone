import { Effect } from "effect";

import type {
  AccountAccessIntents,
  AccountAccessState,
  CodeInput,
  Machine,
  RegistrationInput,
} from "@rtc/core-api";
import {
  ACCOUNT_ACCESS_IDLE,
  type AccountAccessEvent,
  type AccountAccessHeld,
  type AccountRequest,
  callAccountFlow,
  NOTHING_HELD,
  stepAccountAccess,
} from "@rtc/core-logic";
import type { AccountFlowOutcome, AccountFlowPort } from "@rtc/domain";

import { createDetachedHost } from "#/bridge/out";
import { rpc } from "#/bridge/rpc";
import { createSyncRef } from "#/bridge/syncRef";
import { createRunSlot, type Run } from "#/machines/runSlot";

const UNAVAILABLE: AccountFlowOutcome = { ok: false, reason: "unavailable" };

/** The login screen's account flows on a `SyncRef` and a run slot under a
 * detached host (one per mount, like `orderTicket`). A request is one `rpc`
 * fiber; ending the run interrupts it, which unsubscribes the port. A step
 * that `cancelsInFlight` ends the run; `guarded` keeps a superseded answer
 * off the ref. `catchAll` sees failures only, so an interrupt ends the run
 * silently while a failed port stream reads as `unavailable`. The chosen
 * password is held here and never emitted. */
export function createAccountAccessMachine(
  accounts: AccountFlowPort,
): Machine<AccountAccessState, AccountAccessIntents> {
  const host = createDetachedHost();
  const ref = createSyncRef<AccountAccessState>(ACCOUNT_ACCESS_IDLE);
  const slot = createRunSlot(host, ref);
  let held: AccountAccessHeld = NOTHING_HELD;

  function apply(event: AccountAccessEvent): void {
    if (slot.isDisposed()) {
      return;
    }

    const step = stepAccountAccess(ref.get(), held, event);
    held = step.held;

    if (step.state !== ref.get()) {
      ref.set(() => {
        return step.state;
      });
    }

    // The fold decides: an intent the phase ignores keeps the request its
    // `busy` state reports; one it acted on drops it before any new send.
    if (step.cancelsInFlight) {
      slot.end();
    }

    if (step.request !== null) {
      send(step.request);
    }
  }

  function send(request: AccountRequest): void {
    slot.start((run: Run<AccountAccessState>) => {
      return rpc(callAccountFlow(accounts, request)).pipe(
        Effect.catchAll(() => {
          return Effect.succeed(UNAVAILABLE);
        }),
        Effect.flatMap((outcome: AccountFlowOutcome) => {
          return run.guarded(
            Effect.sync(() => {
              apply({ kind: "settled", request, outcome });
            }),
          );
        }),
      );
    });
  }

  return {
    state$: ref.stateStream(),
    intents: {
      startRegistration: (): void => {
        apply({ kind: "startRegistration" });
      },
      startReset: (): void => {
        apply({ kind: "startReset" });
      },
      startCodeEntry: (): void => {
        apply({ kind: "startCodeEntry" });
      },
      returnToSignIn: (): void => {
        apply({ kind: "returnToSignIn" });
      },
      register: (input: RegistrationInput): void => {
        apply({ kind: "register", input });
      },
      requestReset: (email: string): void => {
        apply({ kind: "requestReset", email });
      },
      submitCode: (input: CodeInput): void => {
        apply({ kind: "submitCode", input });
      },
      resendCode: (email?: string): void => {
        apply({ kind: "resendCode", email });
      },
    },
    dispose: (): void => {
      slot.dispose();
    },
  };
}
