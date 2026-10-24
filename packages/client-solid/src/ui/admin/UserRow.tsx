import {
  type Accessor,
  createMemo,
  type JSX,
  onMount,
  Show,
  untrack,
} from "solid-js";

import type { AccountActionIntents, AccountActionState } from "@rtc/core-api";
import {
  ACCOUNT_ADMIN_COPY,
  ACCOUNT_STATUS_LABELS,
  type AccountRowAction,
  describeRowActionLabel,
  describeRowActionText,
  formatJoinedDate,
} from "@rtc/core-logic";
import type { AccountStatus, AccountSummary } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./UsersPanel.module.css";

/**
 * One account: name, email (always beside the name, so a lookalike name
 * cannot pass for another account), joined date, status chip, and the
 * actions its status offers. The row owns its action machine
 * (`useAccountAction(accountId)`, read once at mount). The list keys rows by
 * account id, so a refresh that re-emits the list does not remount the row:
 * it looks its current summary up by id and the machine lives on. The
 * administrator's own row reads "You" and offers nothing.
 */
export function UserRow(props: UserRowProps): JSX.Element {
  const { useAccountAction } = useViewModel();
  // The machine reads the id once, at mount; the row is keyed by it, so the
  // id never changes under a mounted row.
  const { state, intents } = useAccountAction(
    untrack((): string => {
      return props.accountId;
    }),
  );

  const account = createMemo((): AccountSummary | undefined => {
    return props.rows.find((row) => {
      return row.id === props.accountId;
    });
  });

  return (
    <Show when={account()}>
      {(current: Accessor<AccountSummary>): JSX.Element => {
        // Not `keyed`: a re-emitted summary updates the body in place. A
        // keyed Show would rebuild it, taking a rename field's focus with it.
        return (
          <UserRowBody account={current()} state={state()} intents={intents} />
        );
      }}
    </Show>
  );
}

function UserRowBody(props: UserRowBodyProps): JSX.Element {
  function state(): AccountActionState {
    return props.state;
  }

  return (
    <li
      data-testid={`user-row-${props.account.id}`}
      data-status={props.account.status}
      data-self={props.account.isSelf ? "true" : "false"}
      data-phase={state().phase}
      class={styles.row}
    >
      <div class={styles.nameCell}>
        <Show
          when={state().phase === "renaming"}
          fallback={
            <span class={styles.name}>{props.account.displayName}</span>
          }
        >
          <RenameField
            accountId={props.account.id}
            draft={renamingDraft(state())}
            draftError={renamingError(state())}
            intents={props.intents}
          />
        </Show>
      </div>
      <span
        data-testid={`user-email-${props.account.id}`}
        title={props.account.email}
        class={styles.email}
      >
        {props.account.email}
      </span>
      <span class={styles.joined}>
        {formatJoinedDate(props.account.joinedAt)}
      </span>
      <span class={styles.statusCell}>
        <span data-tone={STATUS_TONE[props.account.status]} class={styles.chip}>
          {ACCOUNT_STATUS_LABELS[props.account.status]}
        </span>
      </span>
      <div class={styles.actions}>
        <Show
          when={!props.account.isSelf}
          fallback={<span class={styles.you}>{ACCOUNT_ADMIN_COPY.you}</span>}
        >
          <UserRowActions
            account={props.account}
            state={state()}
            intents={props.intents}
          />
        </Show>
      </div>
      <Show when={failureMessage(state())}>
        {(message: () => string): JSX.Element => {
          return (
            <div role="alert" class={styles.failure}>
              <span data-testid={`user-error-${props.account.id}`}>
                {message()}
              </span>
              <RowButton
                action="dismiss"
                account={props.account}
                onPress={props.intents.dismiss}
              />
            </div>
          );
        }}
      </Show>
    </li>
  );
}

/** The actions cell for another person's account, by phase: the inline
 * delete confirmation, the rename's Save/Cancel, or the status action plus
 * Rename and Delete — disabled while a request runs (the chosen one reads
 * in progress) and while a failure waits to be dismissed. */
function UserRowActions(props: UserRowActionsProps): JSX.Element {
  function startRenaming(): void {
    props.intents.startRename(props.account.displayName);
  }

  function pressStatusAction(): void {
    const statusAction = STATUS_ACTION[props.account.status];

    if (statusAction !== null) {
      props.intents[statusAction]();
    }
  }

  function statusAction(): StatusAction | null {
    return STATUS_ACTION[props.account.status];
  }

  function busyAction(): string | null {
    return props.state.phase === "inFlight" ? props.state.action : null;
  }

  function disabled(): boolean {
    return props.state.phase !== "idle";
  }

  return (
    <Show
      when={props.state.phase !== "confirmingDelete"}
      fallback={
        <>
          <span class={styles.confirmText}>
            {ACCOUNT_ADMIN_COPY.confirmDelete}
          </span>
          <RowButton
            action="confirm"
            account={props.account}
            tone="negative"
            onPress={props.intents.confirmDelete}
          />
          <RowButton
            action="cancel"
            account={props.account}
            onPress={props.intents.cancel}
          />
        </>
      }
    >
      <Show
        when={props.state.phase !== "renaming"}
        fallback={
          <>
            <RowButton
              action="save"
              account={props.account}
              tone="primary"
              disabled={renamingError(props.state) !== null}
              onPress={props.intents.submitRename}
            />
            <RowButton
              action="cancel"
              account={props.account}
              onPress={props.intents.cancel}
            />
          </>
        }
      >
        <Show when={statusAction()}>
          {(action: () => StatusAction): JSX.Element => {
            return (
              <RowButton
                action={action()}
                account={props.account}
                tone={ACTION_TONE[action()]}
                disabled={disabled()}
                busy={busyAction() === action()}
                onPress={pressStatusAction}
              />
            );
          }}
        </Show>
        <RowButton
          action="rename"
          account={props.account}
          disabled={disabled()}
          busy={busyAction() === "rename"}
          onPress={startRenaming}
        />
        <RowButton
          action="delete"
          account={props.account}
          tone="negative"
          disabled={disabled()}
          busy={busyAction() === "delete"}
          onPress={props.intents.requestDelete}
        />
      </Show>
    </Show>
  );
}

/** The name cell while renaming: the draft, the live display-name check's
 * error under it, Enter to save and Escape to cancel. Takes focus when it
 * opens, since Rename was the click that asked for it. */
function RenameField(props: RenameFieldProps): JSX.Element {
  let input!: HTMLInputElement;

  onMount(() => {
    input.focus();
  });

  function editDraft(event: NameInputEvent): void {
    props.intents.editName(event.currentTarget.value);
  }

  function saveOrCancelByKey(event: NameKeyEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      props.intents.submitRename();
    } else if (event.key === "Escape") {
      props.intents.cancel();
    }
  }

  function errorId(): string {
    return `user-name-error-${props.accountId}`;
  }

  return (
    <>
      <input
        ref={input}
        data-testid={`user-name-input-${props.accountId}`}
        class={styles.nameInput}
        type="text"
        autocomplete="off"
        aria-label={ACCOUNT_ADMIN_COPY.nameLabel}
        aria-invalid={props.draftError !== null}
        aria-describedby={props.draftError !== null ? errorId() : undefined}
        value={props.draft}
        onInput={editDraft}
        onKeyDown={saveOrCancelByKey}
      />
      <Show when={props.draftError}>
        {(message: () => string): JSX.Element => {
          return (
            <span
              id={errorId()}
              data-testid={errorId()}
              class={styles.nameError}
            >
              {message()}
            </span>
          );
        }}
      </Show>
    </>
  );
}

/** One row button; its testid is `user-{stem}-{accountId}` (the delete
 * confirmation's stem is `confirm-delete`). Its accessible name adds the
 * account's display name to the visible label, so a screen reader can tell
 * which row's button it is on. */
function RowButton(props: RowButtonProps): JSX.Element {
  function stem(): string {
    return props.action === "confirm" ? "confirm-delete" : props.action;
  }

  function busy(): boolean {
    return props.busy === true;
  }

  function press(): void {
    props.onPress();
  }

  return (
    <button
      type="button"
      data-testid={`user-${stem()}-${props.account.id}`}
      data-tone={props.tone ?? "neutral"}
      data-busy={busy() ? "true" : "false"}
      aria-busy={busy()}
      aria-label={describeRowActionLabel(
        props.action,
        props.account.displayName,
        busy(),
      )}
      class={styles.action}
      disabled={props.disabled === true}
      onClick={press}
    >
      {describeRowActionText(props.action, busy())}
    </button>
  );
}

function renamingDraft(state: AccountActionState): string {
  return state.phase === "renaming" ? state.draft : "";
}

function renamingError(state: AccountActionState): string | null {
  return state.phase === "renaming" ? state.draftError : null;
}

function failureMessage(state: AccountActionState): string | null {
  return state.phase === "failed" ? state.message : null;
}

type NameInputEvent = InputEvent & { currentTarget: HTMLInputElement };

type NameKeyEvent = KeyboardEvent & { currentTarget: HTMLInputElement };

type StatusAction = "approve" | "block" | "unblock";

type Tone = "neutral" | "primary" | "positive" | "negative";

/** The one action a status offers beside Rename and Delete; an unconfirmed
 * account has not proved its email, so there is nothing to approve yet. */
const STATUS_ACTION: Readonly<Record<AccountStatus, StatusAction | null>> = {
  unconfirmed: null,
  pending: "approve",
  active: "block",
  blocked: "unblock",
};

const ACTION_TONE: Readonly<Record<StatusAction, Tone>> = {
  approve: "positive",
  block: "negative",
  unblock: "primary",
};

/** The chip's tone: the skin's positive, warning, negative and muted. */
const STATUS_TONE: Readonly<Record<AccountStatus, string>> = {
  active: "positive",
  pending: "warning",
  blocked: "negative",
  unconfirmed: "muted",
};

interface UserRowProps {
  accountId: string;
  rows: readonly AccountSummary[];
}

interface UserRowBodyProps {
  account: AccountSummary;
  state: AccountActionState;
  intents: AccountActionIntents;
}

interface UserRowActionsProps {
  account: AccountSummary;
  state: AccountActionState;
  intents: AccountActionIntents;
}

interface RenameFieldProps {
  accountId: string;
  draft: string;
  draftError: string | null;
  intents: AccountActionIntents;
}

interface RowButtonProps {
  action: AccountRowAction;
  account: AccountSummary;
  tone?: Tone;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}
