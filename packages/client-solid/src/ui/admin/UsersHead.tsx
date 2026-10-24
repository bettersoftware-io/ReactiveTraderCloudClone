import { createMemo, type JSX, Show } from "solid-js";

import { ACCOUNT_ADMIN_COPY, describePendingCount } from "@rtc/core-logic";
import { useViewModel } from "@rtc/solid-bindings";

import tabStyles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

import styles from "./UsersHead.module.css";

/**
 * The Users panel's head slot: the single, always-active "Users" tab, then —
 * after the spacer — the pending count and the Refresh chip. Reuses the
 * other heads' chrome (PanelHeadTabs.module.css), as OpsHead and
 * CreditBlotterHead do. The count shows only once there is a list to count:
 * "0 pending" while loading, or over a forbidden list, would be a claim the
 * panel cannot make. Refresh stays live in every state — after a
 * `forbidden`, it is how an administrator whose access came back re-reads.
 */
export function UsersHead(): JSX.Element {
  const { useAccountList } = useViewModel();
  const { state, refresh } = useAccountList();
  const counted = createMemo((): boolean => {
    return state().status === "ready" || state().status === "failed";
  });

  return (
    <div class={tabStyles.headTabs}>
      <span
        data-testid="users-head-title"
        data-active="true"
        class={tabStyles.headTab}
      >
        ◉ {ACCOUNT_ADMIN_COPY.panelTitle}
      </span>
      <span class={tabStyles.headSpacer} />
      <Show when={counted()}>
        <span
          data-testid="users-head-pending"
          data-waiting={state().pendingCount > 0 ? "true" : "false"}
          class={styles.pending}
        >
          {describePendingCount(state().pendingCount)}
        </span>
      </Show>
      <button
        type="button"
        data-testid="users-refresh"
        class={tabStyles.csvChip}
        onClick={refresh}
      >
        {ACCOUNT_ADMIN_COPY.refresh}
      </button>
    </div>
  );
}
