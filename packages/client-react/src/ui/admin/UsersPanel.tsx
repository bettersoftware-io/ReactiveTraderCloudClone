import type { ReactElement } from "react";

import type { AccountListState } from "@rtc/core-api";
import {
  ACCOUNT_ADMIN_COLUMNS,
  ACCOUNT_ADMIN_COPY,
  describeAccountAdminRefusal,
} from "@rtc/core-logic";
import type { AccountSummary } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { UserRow } from "./UserRow";

import styles from "./UsersPanel.module.css";

/**
 * The Admin tab's account list: one `UserRow` per account, in the order the
 * presenter hands over (pending first). The panel only lays the list out —
 * every row owns its own action machine. A refused list shows the
 * administrator-required line and no rows; a list that failed to re-read
 * keeps the rows already shown under a one-line notice.
 */
export function UsersPanel(): ReactElement {
  const { useAccountList } = useViewModel();
  const { state } = useAccountList();

  return (
    <div
      data-testid="users-panel"
      data-status={state.status}
      className={styles.panel}
    >
      <UsersPanelBody state={state} />
    </div>
  );
}

function UsersPanelBody({ state }: UsersPanelBodyProps): ReactElement {
  if (state.status === "forbidden") {
    return (
      <p
        data-testid="users-forbidden"
        data-tone="negative"
        className={styles.notice}
      >
        {ACCOUNT_ADMIN_COPY.forbidden}
      </p>
    );
  }

  if (state.status === "loading" && state.rows.length === 0) {
    return <p className={styles.notice}>{ACCOUNT_ADMIN_COPY.loading}</p>;
  }

  return (
    <>
      {state.status === "failed" ? (
        <p data-testid="users-failed" role="alert" className={styles.failed}>
          {describeAccountAdminRefusal("unavailable", "list")}
        </p>
      ) : null}
      {state.rows.length > 0 ? <UsersTable rows={state.rows} /> : null}
      {state.rows.length === 0 && state.status === "ready" ? (
        <p data-testid="users-empty" className={styles.notice}>
          {ACCOUNT_ADMIN_COPY.empty}
        </p>
      ) : null}
    </>
  );
}

/** The column labels and the rows, on one grid: each row is a subgrid of
 * it, so the email, date and status columns line up down the list. */
function UsersTable({ rows }: UsersTableProps): ReactElement {
  return (
    <div className={styles.table}>
      <div className={styles.columns} aria-hidden="true">
        <span>{ACCOUNT_ADMIN_COLUMNS.name}</span>
        <span>{ACCOUNT_ADMIN_COLUMNS.email}</span>
        <span>{ACCOUNT_ADMIN_COLUMNS.joined}</span>
        <span>{ACCOUNT_ADMIN_COLUMNS.status}</span>
        <span />
      </div>
      <ul className={styles.rows}>
        {rows.map((row) => {
          // Keyed by account id: each row's action machine reads its id
          // once, at mount, so a row must never be reused for another.
          return <UserRow key={row.id} account={row} />;
        })}
      </ul>
    </div>
  );
}

interface UsersPanelBodyProps {
  state: AccountListState;
}

interface UsersTableProps {
  rows: readonly AccountSummary[];
}
