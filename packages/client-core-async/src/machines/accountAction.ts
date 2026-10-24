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

import { once } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { createRunSlot } from "#/kernel/runSlot";
import { createStore } from "#/kernel/store";

const UNAVAILABLE: AccountActionOutcome = { ok: false, reason: "unavailable" };

/** One account row's administrator action on a Store and a run slot: one
 * request in flight at most, folded by `stepAccountAction`. `dispose()` makes
 * the intents inert and ends the run, so a late answer lands nowhere. A
 * settled call that changed something (or was refused as `forbidden`)
 * re-reads the list through the account-list presenter. An erroring port
 * reads as `unavailable`. */
export function createAccountActionMachine(
  accountId: string,
  accountList: AccountListPresenter,
): Machine<AccountActionState, AccountActionIntents> {
  const store = createStore<AccountActionState>(ACCOUNT_ACTION_IDLE);
  const slot = createRunSlot(store);

  function apply(event: AccountActionEvent): void {
    if (slot.isDisposed()) {
      return;
    }

    const previous = store.get();
    const step = stepAccountAction(previous, event);

    if (step.state !== previous) {
      store.set(step.state);
    }

    if (
      event.type === "settled" &&
      previous.phase === "inFlight" &&
      refreshesAccountList(event.outcome)
    ) {
      accountList.refresh();
    }

    if (step.request !== null) {
      send(step.request);
    }
  }

  function send(request: AccountAdminAction): void {
    slot.start(async (run) => {
      let outcome: AccountActionOutcome;

      try {
        outcome = await once(
          accountList.admin.actOn(accountId, request),
          run.signal,
        );
      } catch {
        outcome = UNAVAILABLE;
      }

      run.ifCurrent(() => {
        apply({ type: "settled", outcome });
      });
    });
  }

  return {
    state$: storeToStateStream(store),
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
      slot.dispose();
    },
  };
}
