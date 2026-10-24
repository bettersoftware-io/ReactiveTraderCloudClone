import type { AccountListState } from "@rtc/core-api";
import type { AccountListOutcome, AccountSummary } from "@rtc/domain";

/** Before the first answer: loading, nothing to show. */
export const ACCOUNT_LIST_LOADING: AccountListState = {
  status: "loading",
  rows: [],
  pendingCount: 0,
};

/** Pending rows first, oldest join first (the longest wait is on top);
 * then the rest, newest first. Ties are broken by id. */
export function orderAccountRows(
  accounts: readonly AccountSummary[],
): readonly AccountSummary[] {
  return [...accounts].sort((a, b) => {
    const aPending = a.status === "pending";
    const bPending = b.status === "pending";

    if (aPending !== bPending) {
      return aPending ? -1 : 1;
    }

    if (a.joinedAt !== b.joinedAt) {
      return aPending ? a.joinedAt - b.joinedAt : b.joinedAt - a.joinedAt;
    }

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Accounts waiting for an administrator. An `unconfirmed` account has not
 * proved its email yet, so it is not waiting for anyone. */
export function countPending(accounts: readonly AccountSummary[]): number {
  return accounts.filter((account) => {
    return account.status === "pending";
  }).length;
}

/** `ok` is `ready`; `forbidden` is `forbidden` with nothing to show; any
 * other refusal is `failed` over the rows already shown. */
export function foldAccountList(
  outcome: AccountListOutcome,
  previous: AccountListState,
): AccountListState {
  if (outcome.ok) {
    return {
      status: "ready",
      rows: orderAccountRows(outcome.accounts),
      pendingCount: countPending(outcome.accounts),
    };
  }

  if (outcome.reason === "forbidden") {
    return { status: "forbidden", rows: [], pendingCount: 0 };
  }

  return {
    status: "failed",
    rows: previous.rows,
    pendingCount: previous.pendingCount,
  };
}
