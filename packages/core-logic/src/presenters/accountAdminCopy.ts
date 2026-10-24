import type { AccountActionKind } from "@rtc/core-api";
import type { AccountAdminRefusal, AccountStatus } from "@rtc/domain";

/** Every line the Admin tab's Users panel shows, once: both web clients
 * read their copy from here, so the two cannot drift. */
export const ACCOUNT_ADMIN_COPY = {
  panelTitle: "Users",
  empty: "No registered accounts yet.",
  forbidden: "Administrator access required",
  confirmDelete: "Delete this account?",
  you: "You",
  loading: "Loading accounts",
  refresh: "Refresh",
  approve: "Approve",
  block: "Block",
  unblock: "Unblock",
  rename: "Rename",
  delete: "Delete",
  confirm: "Confirm",
  cancel: "Cancel",
  save: "Save",
  dismiss: "Dismiss",
  nameLabel: "Display name",
} as const;

/** The chip each account status wears. */
export const ACCOUNT_STATUS_LABELS: Readonly<Record<AccountStatus, string>> = {
  unconfirmed: "Unconfirmed",
  pending: "Pending",
  active: "Active",
  blocked: "Blocked",
};

/** The mono column labels above the Users panel's rows. */
export const ACCOUNT_ADMIN_COLUMNS = {
  name: "Name",
  email: "Email",
  joined: "Joined",
  status: "Status",
} as const;

/** What the chosen button reads while its request runs. */
export const ACCOUNT_ACTION_PROGRESS_LABELS: Readonly<
  Record<AccountActionKind, string>
> = {
  approve: "Approving…",
  block: "Blocking…",
  unblock: "Unblocking…",
  rename: "Renaming…",
  delete: "Deleting…",
};

/** A row button: one of the account actions, or a control of the inline
 * delete confirmation, the rename field or a failure line. */
export type AccountRowAction =
  | AccountActionKind
  | "confirm"
  | "cancel"
  | "save"
  | "dismiss";

/** A row button's visible label; `busy` reads an account action in
 * progress ("Approving…"). */
export function describeRowActionText(
  action: AccountRowAction,
  busy = false,
): string {
  return busy && isAccountActionKind(action)
    ? ACCOUNT_ACTION_PROGRESS_LABELS[action]
    : ACCOUNT_ADMIN_COPY[action];
}

/** A row button's accessible name: its visible label and the account it
 * acts on ("Approve Ann Lee"). Every row shows the same labels, so without
 * the name a screen reader cannot tell one row's Approve from another's. */
export function describeRowActionLabel(
  action: AccountRowAction,
  displayName: string,
  busy = false,
): string {
  return `${describeRowActionText(action, busy)} ${displayName}`;
}

/** The pending line beside the panel title. */
export function describePendingCount(count: number): string {
  return `${count} pending`;
}

/** The day an account joined, `YYYY-MM-DD` in UTC, so every client and
 * every time zone shows one date for one account. An instant no `Date` can
 * hold reads as an empty cell. */
export function formatJoinedDate(ms: number): string {
  const date = new Date(ms);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

/** The line for a refused admin call. Admin refusals carry no detail beyond
 * the refusal word, so this text is all the user learns. */
export function describeAccountAdminRefusal(
  refusal: AccountAdminRefusal,
  action: AccountActionKind | "list",
): string {
  switch (refusal) {
    case "forbidden":
      return ACCOUNT_ADMIN_COPY.forbidden;
    case "self":
      return "You cannot change your own account";
    case "not_found":
      return "That account no longer exists";
    case "invalid_name":
      return "That display name was not accepted";
    case "unavailable":
      return action === "list"
        ? "The account list could not be loaded. Try again shortly"
        : "The live desk is unavailable right now. Try again shortly";
  }
}

function isAccountActionKind(
  action: AccountRowAction,
): action is AccountActionKind {
  return Object.hasOwn(ACCOUNT_ACTION_PROGRESS_LABELS, action);
}
