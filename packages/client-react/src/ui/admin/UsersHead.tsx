import type { ReactElement } from "react";

import { ACCOUNT_ADMIN_COPY, describePendingCount } from "@rtc/core-logic";
import { useViewModel } from "@rtc/react-bindings";

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
export function UsersHead(): ReactElement {
  const { useAccountList } = useViewModel();
  const { state, refresh } = useAccountList();
  const counted = state.status === "ready" || state.status === "failed";

  return (
    <div className={tabStyles.headTabs}>
      <span
        data-testid="users-head-title"
        data-active="true"
        className={tabStyles.headTab}
      >
        ◉ {ACCOUNT_ADMIN_COPY.panelTitle}
      </span>
      <span className={tabStyles.headSpacer} />
      {counted ? (
        <span
          data-testid="users-head-pending"
          data-waiting={state.pendingCount > 0 ? "true" : "false"}
          className={styles.pending}
        >
          {describePendingCount(state.pendingCount)}
        </span>
      ) : null}
      <button
        type="button"
        data-testid="users-refresh"
        className={tabStyles.csvChip}
        onClick={refresh}
      >
        {ACCOUNT_ADMIN_COPY.refresh}
      </button>
    </div>
  );
}
