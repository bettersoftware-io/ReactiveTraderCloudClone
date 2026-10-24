import { type StateObservable, state } from "@rx-state/core";
import { BehaviorSubject, type Observable, of, type Subscription } from "rxjs";
import { catchError } from "rxjs/operators";

import type {
  AccountActionIntents,
  AccountActionState,
  AccountListPresenter,
  Machine,
} from "@rtc/core-api";
import {
  ACCOUNT_ACTION_IDLE,
  type AccountActionEvent,
  refreshesAccountList,
  stepAccountAction,
} from "@rtc/core-logic";
import type { AccountActionOutcome, AccountAdminAction } from "@rtc/domain";

const UNAVAILABLE: AccountActionOutcome = { ok: false, reason: "unavailable" };

/** One account row's administrator action: a `BehaviorSubject` fed by
 * `stepAccountAction`, one request in flight at most. `dispose()` makes the
 * intents inert and unsubscribes the request, so a late answer never lands.
 * A settled call that changed something (or was refused as `forbidden`)
 * re-reads the list through the account-list presenter. An erroring port
 * stream reads as `unavailable`. */
export function createAccountActionMachine(
  accountId: string,
  accountList: AccountListPresenter,
): Machine<AccountActionState, AccountActionIntents> {
  const subject = new BehaviorSubject<AccountActionState>(ACCOUNT_ACTION_IDLE);
  const state$: StateObservable<AccountActionState> = state(
    subject,
    ACCOUNT_ACTION_IDLE,
  );
  let inFlight: Subscription | null = null;
  let disposed = false;

  function cancelRequest(): void {
    inFlight?.unsubscribe();
    inFlight = null;
  }

  function apply(event: AccountActionEvent): void {
    if (disposed) {
      return;
    }

    const previous = subject.value;
    const step = stepAccountAction(previous, event);

    if (step.state !== previous) {
      subject.next(step.state);
    }

    if (event.type === "settled" && previous.phase === "inFlight") {
      inFlight = null;

      if (refreshesAccountList(event.outcome)) {
        accountList.refresh();
      }
    }

    if (step.request !== null) {
      send(step.request);
    }
  }

  function send(request: AccountAdminAction): void {
    // A port that answers synchronously settles inside `subscribe`, before
    // the assignment: `inFlight` then stores an already-closed subscription,
    // and unsubscribing a closed subscription is a no-op.
    inFlight = accountList.admin
      .actOn(accountId, request)
      .pipe(
        catchError((): Observable<AccountActionOutcome> => {
          return of(UNAVAILABLE);
        }),
      )
      .subscribe((outcome: AccountActionOutcome): void => {
        apply({ type: "settled", outcome });
      });
  }

  return {
    state$,
    intents: {
      approve: (): void => {
        apply({ type: "approve" });
      },
      block: (): void => {
        apply({ type: "block" });
      },
      unblock: (): void => {
        apply({ type: "unblock" });
      },
      startRename: (current: string): void => {
        apply({ type: "startRename", current });
      },
      editName: (draft: string): void => {
        apply({ type: "editName", draft });
      },
      submitRename: (): void => {
        apply({ type: "submitRename" });
      },
      requestDelete: (): void => {
        apply({ type: "requestDelete" });
      },
      confirmDelete: (): void => {
        apply({ type: "confirmDelete" });
      },
      cancel: (): void => {
        apply({ type: "cancel" });
      },
      dismiss: (): void => {
        apply({ type: "dismiss" });
      },
    },
    dispose: (): void => {
      disposed = true;
      cancelRequest();
    },
  };
}
