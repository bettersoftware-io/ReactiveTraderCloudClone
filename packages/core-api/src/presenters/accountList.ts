import type { AccountAdminPort, AccountSummary } from "@rtc/domain";

import type { StateStream } from "#/stream";

export type AccountListStatus = "loading" | "ready" | "failed" | "forbidden";

/** The administrator's account list: `rows` are in display order, and
 * `pendingCount` counts the unconfirmed-by-admin (`pending`) rows only. */
export interface AccountListState {
  readonly status: AccountListStatus;
  readonly rows: readonly AccountSummary[];
  readonly pendingCount: number;
}

/** The Admin tab's account list, keyed on the signed-in user (their email,
 * not the display `id`, which can collide). Loads on the FIRST subscription
 * (not at construction: a non-administrator never subscribes, so never
 * asks) and re-reads on `refresh()` while the rows already shown stay
 * visible. For one user it is warm: unsubscribing everyone and subscribing
 * again does not reload. When the user signs out or changes it resets to
 * `loading` with NO rows (another person's accounts are never shown or held),
 * cancels a load in flight, and loads again at once if a subscriber is
 * attached, else on the next first subscription. A signed-out presenter
 * never calls the port. */
export interface AccountListPresenter {
  /** Replay-current. */
  readonly state$: StateStream<AccountListState>;
  /** Re-reads the list; the rows stay visible while it loads. A no-op until
   * the first subscription has started the first load, and when signed out. */
  refresh(): void;
  /** The port's calls, for the `accountAction` machine — a machine factory
   * is handed presenters only, so the port reaches it through here.
   * Pass-through: nothing is written to `state$`. */
  readonly admin: AccountAdminPort;
}
