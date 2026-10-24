import { Effect } from "effect";

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

import { createDetachedHost } from "#/bridge/out";
import { rpc } from "#/bridge/rpc";
import { createSyncRef } from "#/bridge/syncRef";
import { createRunSlot, type Run } from "#/machines/runSlot";

const UNAVAILABLE: AccountActionOutcome = { ok: false, reason: "unavailable" };

/** One account row's administrator action on a `SyncRef` and a run slot
 * under a detached host (one per mounted row, like `accountAccess`): one
 * request in flight at most, folded by `stepAccountAction`. A request is one
 * `rpc` fiber; `dispose()` ends it, which unsubscribes the port, and the
 * slot's token keeps a late answer off the ref. A settled call that changed
 * something (or was refused as `forbidden`) re-reads the list through the
 * account-list presenter. An erroring port reads as `unavailable`. */
export function createAccountActionMachine(
  accountId: string,
  accountList: AccountListPresenter,
): Machine<AccountActionState, AccountActionIntents> {
  const host = createDetachedHost();
  const ref = createSyncRef<AccountActionState>(ACCOUNT_ACTION_IDLE);
  const slot = createRunSlot(host, ref);

  function apply(event: AccountActionEvent): void {
    if (slot.isDisposed()) {
      return;
    }

    const previous = ref.get();
    const step = stepAccountAction(previous, event);

    if (step.state !== previous) {
      ref.set(() => {
        return step.state;
      });
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
    slot.start((run: Run<AccountActionState>) => {
      return Effect.suspend(() => {
        return rpc(accountList.admin.actOn(accountId, request));
      }).pipe(
        Effect.catchAll(() => {
          return Effect.succeed(UNAVAILABLE);
        }),
        Effect.flatMap((outcome: AccountActionOutcome) => {
          return run.guarded(
            Effect.sync(() => {
              apply({ type: "settled", outcome });
            }),
          );
        }),
      );
    });
  }

  return {
    state$: ref.stateStream(),
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
