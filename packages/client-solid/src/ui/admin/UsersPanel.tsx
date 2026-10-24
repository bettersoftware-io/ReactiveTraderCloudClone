import { createMemo, For, type JSX, Match, Show, Switch } from "solid-js";

import type { AccountListState } from "@rtc/core-api";
import {
  ACCOUNT_ADMIN_COLUMNS,
  ACCOUNT_ADMIN_COPY,
  describeAccountAdminRefusal,
} from "@rtc/core-logic";
import type { AccountSummary } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { UserRow } from "./UserRow";

import styles from "./UsersPanel.module.css";

/**
 * The Admin tab's account list: one `UserRow` per account, in the order the
 * presenter hands over (pending first). The panel only lays the list out —
 * every row owns its own action machine. A refused list shows the
 * administrator-required line and no rows; a list that failed to re-read
 * keeps the rows already shown under a one-line notice.
 */
export function UsersPanel(): JSX.Element {
  const { useAccountList } = useViewModel();
  const { state } = useAccountList();

  return (
    <div
      data-testid="users-panel"
      data-status={state().status}
      class={styles.panel}
    >
      <UsersPanelBody state={state()} />
    </div>
  );
}

function UsersPanelBody(props: UsersPanelBodyProps): JSX.Element {
  return (
    <Switch>
      <Match when={props.state.status === "forbidden"}>
        <p
          data-testid="users-forbidden"
          data-tone="negative"
          class={styles.notice}
        >
          {ACCOUNT_ADMIN_COPY.forbidden}
        </p>
      </Match>
      <Match
        when={props.state.status === "loading" && props.state.rows.length === 0}
      >
        <p class={styles.notice}>{ACCOUNT_ADMIN_COPY.loading}</p>
      </Match>
      <Match when={true}>
        <Show when={props.state.status === "failed"}>
          <p data-testid="users-failed" role="alert" class={styles.failed}>
            {describeAccountAdminRefusal("unavailable", "list")}
          </p>
        </Show>
        <Show when={props.state.rows.length > 0}>
          <UsersTable rows={props.state.rows} />
        </Show>
        <Show
          when={props.state.rows.length === 0 && props.state.status === "ready"}
        >
          <p data-testid="users-empty" class={styles.notice}>
            {ACCOUNT_ADMIN_COPY.empty}
          </p>
        </Show>
      </Match>
    </Switch>
  );
}

/** The column labels and the rows, on one grid: each row is a subgrid of
 * it, so the email, date and status columns line up down the list. */
function UsersTable(props: UsersTableProps): JSX.Element {
  const ids = createMemo((): string[] => {
    return props.rows.map((row) => {
      return row.id;
    });
  });

  return (
    <div class={styles.table}>
      <div class={styles.columns} aria-hidden="true">
        <span>{ACCOUNT_ADMIN_COLUMNS.name}</span>
        <span>{ACCOUNT_ADMIN_COLUMNS.email}</span>
        <span>{ACCOUNT_ADMIN_COLUMNS.joined}</span>
        <span>{ACCOUNT_ADMIN_COLUMNS.status}</span>
        <span />
      </div>
      <ul class={styles.rows}>
        {/* Keyed by account id, the analogue of React's `key={row.id}`:
            every list refresh hands over NEW row objects for the same
            accounts, and `<For>` over the objects would remount each row
            and dispose its action machine (a request in flight, a failure,
            a rename draft would all be lost). Over the id strings a row
            stays mounted and looks up its current summary. Never `<Index>`:
            a row's machine reads its id once, at mount. */}
        <For each={ids()}>
          {(id: string): JSX.Element => {
            return <UserRow accountId={id} rows={props.rows} />;
          }}
        </For>
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
