import type { AccountActionKind, AccountActionState } from "@rtc/core-api";
import type { AccountActionOutcome, AccountAdminAction } from "@rtc/domain";

import { checkDisplayNameInput } from "#/presenters/accountAccessFold";
import { describeAccountAdminRefusal } from "#/presenters/accountAdminCopy";

export const ACCOUNT_ACTION_IDLE: AccountActionState = { phase: "idle" };

/** One per intent, plus the answer to the request the fold asked for. */
export type AccountActionEvent =
  | { readonly type: "approve" }
  | { readonly type: "block" }
  | { readonly type: "unblock" }
  | { readonly type: "startRename"; readonly current: string }
  | { readonly type: "editName"; readonly draft: string }
  | { readonly type: "submitRename" }
  | { readonly type: "requestDelete" }
  | { readonly type: "confirmDelete" }
  | { readonly type: "cancel" }
  | { readonly type: "dismiss" }
  | { readonly type: "settled"; readonly outcome: AccountActionOutcome };

export interface AccountActionStep {
  readonly state: AccountActionState;
  /** The call to send now, or null. */
  readonly request: AccountAdminAction | null;
}

/** The row-action machine's one transition function. An event the phase does
 * not list is ignored (the same state, nothing sent) — a `settled` outside
 * `inFlight` included, which is how a late answer after `cancel` or
 * `dispose` writes nothing. */
export function stepAccountAction(
  state: AccountActionState,
  event: AccountActionEvent,
): AccountActionStep {
  switch (state.phase) {
    case "idle":
      return stepIdle(state, event);
    case "confirmingDelete":
      return stepConfirmingDelete(state, event);
    case "renaming":
      return stepRenaming(state, state.draft, event);
    case "inFlight":
      return stepInFlight(state, state.action, event);
    case "failed":
      return event.type === "dismiss" ? move(ACCOUNT_ACTION_IDLE) : move(state);
  }
}

/** A success re-reads the list; so does a `forbidden` refusal, which sends
 * the list into its own `forbidden` state. */
export function refreshesAccountList(outcome: AccountActionOutcome): boolean {
  return outcome.ok || outcome.reason === "forbidden";
}

function stepIdle(
  state: AccountActionState,
  event: AccountActionEvent,
): AccountActionStep {
  switch (event.type) {
    case "approve":
    case "block":
    case "unblock":
      return send(event.type, { kind: event.type });
    case "requestDelete":
      return move({ phase: "confirmingDelete" });
    case "startRename":
      return move({
        phase: "renaming",
        draft: event.current,
        draftError: null,
      });
    default:
      return move(state);
  }
}

function stepConfirmingDelete(
  state: AccountActionState,
  event: AccountActionEvent,
): AccountActionStep {
  switch (event.type) {
    case "confirmDelete":
      return send("delete", { kind: "delete" });
    case "cancel":
      return move(ACCOUNT_ACTION_IDLE);
    default:
      return move(state);
  }
}

function stepRenaming(
  state: AccountActionState,
  draft: string,
  event: AccountActionEvent,
): AccountActionStep {
  switch (event.type) {
    case "editName":
      return move({
        phase: "renaming",
        draft: event.draft,
        draftError: draftErrorOf(event.draft),
      });

    case "submitRename": {
      const check = checkDisplayNameInput(draft);

      return check.ok
        ? send("rename", { kind: "rename", displayName: check.value })
        : move({ phase: "renaming", draft, draftError: check.error });
    }

    case "cancel":
      return move(ACCOUNT_ACTION_IDLE);
    default:
      return move(state);
  }
}

function stepInFlight(
  state: AccountActionState,
  action: AccountActionKind,
  event: AccountActionEvent,
): AccountActionStep {
  if (event.type !== "settled") {
    return move(state);
  }

  return event.outcome.ok
    ? move(ACCOUNT_ACTION_IDLE)
    : move({
        phase: "failed",
        action,
        message: describeAccountAdminRefusal(event.outcome.reason, action),
      });
}

function draftErrorOf(draft: string): string | null {
  const check = checkDisplayNameInput(draft);

  return check.ok ? null : check.error;
}

function move(state: AccountActionState): AccountActionStep {
  return { state, request: null };
}

function send(
  action: AccountActionKind,
  request: AccountAdminAction,
): AccountActionStep {
  return { state: { phase: "inFlight", action }, request };
}
