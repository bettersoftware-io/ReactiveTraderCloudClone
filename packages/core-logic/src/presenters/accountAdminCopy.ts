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

/** The pending line beside the panel title. */
export function describePendingCount(count: number): string {
  return `${count} pending`;
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
