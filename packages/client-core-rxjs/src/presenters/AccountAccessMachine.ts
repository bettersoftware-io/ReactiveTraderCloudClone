import { type StateObservable, state } from "@rx-state/core";
import { BehaviorSubject, type Observable, of, type Subscription } from "rxjs";
import { catchError } from "rxjs/operators";

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

const UNAVAILABLE: AccountFlowOutcome = { ok: false, reason: "unavailable" };

/** The login screen's account flows: a `BehaviorSubject` fed by
 * `stepAccountAccess`, one request in flight at most (a new request or a
 * navigation unsubscribes the old one, so a late answer never lands), the
 * chosen password held in this closure and never emitted. An erroring port
 * stream reads as `unavailable`. */
export function createAccountAccessMachine(
  accounts: AccountFlowPort,
): Machine<AccountAccessState, AccountAccessIntents> {
  const subject = new BehaviorSubject<AccountAccessState>(ACCOUNT_ACCESS_IDLE);
  const state$: StateObservable<AccountAccessState> = state(
    subject,
    ACCOUNT_ACCESS_IDLE,
  );
  let held: AccountAccessHeld = NOTHING_HELD;
  let inFlight: Subscription | null = null;
  let disposed = false;

  function cancelRequest(): void {
    inFlight?.unsubscribe();
    inFlight = null;
  }

  function apply(event: AccountAccessEvent): void {
    if (disposed) {
      return;
    }

    const step = stepAccountAccess(subject.value, held, event);
    const changed = step.state !== subject.value;
    held = step.held;

    if (changed) {
      subject.next(step.state);
    }

    // An intent the phase ignores leaves the state (and its `busy`) as it
    // was, so the request it reports stays in flight; one that moved the
    // phase on, or refused its input locally, drops it.
    if (step.request !== null) {
      send(step.request);
    } else if (changed && event.kind !== "settled") {
      cancelRequest();
    }
  }

  function send(request: AccountRequest): void {
    cancelRequest();
    // A port that answers synchronously settles inside `subscribe`, before
    // the assignment: `inFlight` then stores an already-closed subscription,
    // and unsubscribing a closed subscription is a no-op.
    inFlight = callAccountFlow(accounts, request)
      .pipe(
        catchError((): Observable<AccountFlowOutcome> => {
          return of(UNAVAILABLE);
        }),
      )
      .subscribe((outcome: AccountFlowOutcome): void => {
        apply({ kind: "settled", request, outcome });
      });
  }

  return {
    state$,
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
      disposed = true;
      cancelRequest();
    },
  };
}
