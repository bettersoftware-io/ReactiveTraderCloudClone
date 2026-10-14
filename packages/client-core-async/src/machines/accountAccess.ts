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

import { once } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { createRunSlot } from "#/kernel/runSlot";
import { createStore } from "#/kernel/store";

const UNAVAILABLE: AccountFlowOutcome = { ok: false, reason: "unavailable" };

/** The login screen's account flows on a Store and a run slot: one request in
 * flight at most. A step that `cancelsInFlight` ends the run, which aborts
 * `once` and so releases the port subscription; `ifCurrent` keeps a late
 * answer off the store. The chosen password is held in this closure and never
 * emitted. A failing port stream reads as `unavailable`. */
export function createAccountAccessMachine(
  accounts: AccountFlowPort,
): Machine<AccountAccessState, AccountAccessIntents> {
  const store = createStore<AccountAccessState>(ACCOUNT_ACCESS_IDLE);
  const slot = createRunSlot(store);
  let held: AccountAccessHeld = NOTHING_HELD;

  function apply(event: AccountAccessEvent): void {
    if (slot.isDisposed()) {
      return;
    }

    const step = stepAccountAccess(store.get(), held, event);
    held = step.held;

    if (step.state !== store.get()) {
      store.set(step.state);
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
    slot.start(async (run) => {
      let outcome: AccountFlowOutcome;

      try {
        outcome = await once(callAccountFlow(accounts, request), run.signal);
      } catch {
        outcome = UNAVAILABLE;
      }

      run.ifCurrent(() => {
        apply({ kind: "settled", request, outcome });
      });
    });
  }

  return {
    state$: storeToStateStream(store),
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
