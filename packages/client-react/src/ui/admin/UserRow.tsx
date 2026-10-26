import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
} from "react";

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
import { useViewModel } from "@rtc/react-bindings";

import styles from "./UsersPanel.module.css";

/**
 * One account: name, email (always beside the name, so a lookalike name
 * cannot pass for another account), joined date, status chip, and the
 * actions its status offers. The row owns its action machine
 * (`useAccountAction(account.id)`, read once at mount — the list keys rows
 * by id). The administrator's own row reads "You" and offers nothing.
 */
export function UserRow({ account }: UserRowProps): ReactElement {
  const { useAccountAction } = useViewModel();
  const { state, intents } = useAccountAction(account.id);
  const renaming = state.phase === "renaming";
  const renameButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const row = useRef<HTMLLIElement>(null);
  const phase = state.phase;
  const previousPhase = useRef(phase);
  const owedFocus = useRef<"rename" | "delete" | null>(null);

  // Rename's and delete-confirmation's buttons unmount when the row leaves
  // those phases, taking keyboard focus with them. Remember which button the
  // row owes focus to, and give it back once that button is there and
  // enabled again (a save is in flight first). Only a transition sets the
  // debt, so mounting or a list refresh never moves focus, and it is paid
  // only when focus fell to the page (or is still in this row): the
  // administrator who moved on meanwhile is not pulled back.
  useEffect(() => {
    const previous = previousPhase.current;

    previousPhase.current = phase;

    if (previous === "renaming" && phase !== "renaming") {
      owedFocus.current = "rename";
    } else if (previous === "confirmingDelete") {
      owedFocus.current = phase === "idle" ? "delete" : null;
    }

    if (phase !== "idle" || owedFocus.current === null) {
      return;
    }

    const target = owedFocus.current === "rename" ? renameButton : deleteButton;

    owedFocus.current = null;

    if (focusIsFree(row.current)) {
      target.current?.focus();
    }
  }, [phase]);

  return (
    <li
      ref={row}
      data-testid={`user-row-${account.id}`}
      data-status={account.status}
      data-self={account.isSelf ? "true" : "false"}
      data-phase={state.phase}
      className={styles.row}
    >
      <div className={styles.nameCell}>
        {renaming ? (
          <RenameField
            accountId={account.id}
            draft={state.draft}
            draftError={state.draftError}
            intents={intents}
          />
        ) : (
          <span className={styles.name}>{account.displayName}</span>
        )}
      </div>
      <span
        data-testid={`user-email-${account.id}`}
        title={account.email}
        className={styles.email}
      >
        {account.email}
      </span>
      <span className={styles.joined}>
        {formatJoinedDate(account.joinedAt)}
      </span>
      <span className={styles.statusCell}>
        <span data-tone={STATUS_TONE[account.status]} className={styles.chip}>
          {ACCOUNT_STATUS_LABELS[account.status]}
        </span>
      </span>
      <div className={styles.actions}>
        {account.isSelf ? (
          <span className={styles.you}>{ACCOUNT_ADMIN_COPY.you}</span>
        ) : (
          <UserRowActions
            account={account}
            state={state}
            intents={intents}
            renameButton={renameButton}
            deleteButton={deleteButton}
          />
        )}
      </div>
      {state.phase === "failed" ? (
        <div role="alert" className={styles.failure}>
          <span data-testid={`user-error-${account.id}`}>{state.message}</span>
          <RowButton
            action="dismiss"
            account={account}
            onPress={intents.dismiss}
          />
        </div>
      ) : null}
    </li>
  );
}

/** The actions cell for another person's account, by phase: the inline
 * delete confirmation, the rename's Save/Cancel, or the status action plus
 * Rename and Delete — disabled while a request runs (the chosen one reads
 * in progress) and while a failure waits to be dismissed. */
function UserRowActions({
  account,
  state,
  intents,
  renameButton,
  deleteButton,
}: UserRowActionsProps): ReactElement {
  if (state.phase === "confirmingDelete") {
    return (
      <>
        <span className={styles.confirmText}>
          {ACCOUNT_ADMIN_COPY.confirmDelete}
        </span>
        <RowButton
          action="confirm"
          account={account}
          tone="negative"
          onPress={intents.confirmDelete}
        />
        <RowButton action="cancel" account={account} onPress={intents.cancel} />
      </>
    );
  }

  if (state.phase === "renaming") {
    return (
      <>
        <RowButton
          action="save"
          account={account}
          tone="primary"
          disabled={state.draftError !== null}
          onPress={intents.submitRename}
        />
        <RowButton action="cancel" account={account} onPress={intents.cancel} />
      </>
    );
  }

  const statusAction = STATUS_ACTION[account.status];
  const busyAction = state.phase === "inFlight" ? state.action : null;
  const disabled = state.phase !== "idle";

  function startRenaming(): void {
    intents.startRename(account.displayName);
  }

  return (
    <>
      {statusAction === null ? null : (
        <RowButton
          action={statusAction}
          account={account}
          tone={ACTION_TONE[statusAction]}
          disabled={disabled}
          busy={busyAction === statusAction}
          onPress={intents[statusAction]}
        />
      )}
      <RowButton
        action="rename"
        account={account}
        buttonRef={renameButton}
        disabled={disabled}
        busy={busyAction === "rename"}
        onPress={startRenaming}
      />
      <RowButton
        action="delete"
        account={account}
        buttonRef={deleteButton}
        tone="negative"
        disabled={disabled}
        busy={busyAction === "delete"}
        onPress={intents.requestDelete}
      />
    </>
  );
}

/** The name cell while renaming: the draft, the live display-name check's
 * error under it, Enter to save and Escape to cancel. Takes focus when it
 * opens, since Rename was the click that asked for it. */
function RenameField({
  accountId,
  draft,
  draftError,
  intents,
}: RenameFieldProps): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const errorId = `user-name-error-${accountId}`;

  useEffect(() => {
    input.current?.focus();
  }, []);

  function editDraft(event: ChangeEvent<HTMLInputElement>): void {
    intents.editName(event.target.value);
  }

  function saveOrCancelByKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      intents.submitRename();
    } else if (event.key === "Escape") {
      intents.cancel();
    }
  }

  return (
    <>
      <input
        ref={input}
        data-testid={`user-name-input-${accountId}`}
        className={styles.nameInput}
        type="text"
        autoComplete="off"
        aria-label={ACCOUNT_ADMIN_COPY.nameLabel}
        aria-invalid={draftError !== null}
        aria-describedby={draftError !== null ? errorId : undefined}
        value={draft}
        onChange={editDraft}
        onKeyDown={saveOrCancelByKey}
      />
      {draftError !== null ? (
        <span id={errorId} data-testid={errorId} className={styles.nameError}>
          {draftError}
        </span>
      ) : null}
    </>
  );
}

/** One row button; its testid is `user-{stem}-{accountId}` (the delete
 * confirmation's stem is `confirm-delete`). Its accessible name adds the
 * account's display name to the visible label, so a screen reader can tell
 * which row's button it is on. */
function RowButton({
  action,
  account,
  tone = "neutral",
  disabled = false,
  busy = false,
  buttonRef,
  onPress,
}: RowButtonProps): ReactElement {
  const stem = action === "confirm" ? "confirm-delete" : action;

  function press(): void {
    onPress();
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      data-testid={`user-${stem}-${account.id}`}
      data-tone={tone}
      data-busy={busy ? "true" : "false"}
      aria-busy={busy}
      aria-label={describeRowActionLabel(action, account.displayName, busy)}
      className={styles.action}
      disabled={disabled}
      onClick={press}
    >
      {describeRowActionText(action, busy)}
    </button>
  );
}

/** True when focus is on the page itself (nothing holds it) or inside `row`:
 * the only times giving it back to a row's button is not stealing it. */
function focusIsFree(row: HTMLElement | null): boolean {
  const active = document.activeElement;

  return (
    active === null ||
    active === document.body ||
    row?.contains(active) === true
  );
}

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
  account: AccountSummary;
}

interface UserRowActionsProps {
  account: AccountSummary;
  state: AccountActionState;
  intents: AccountActionIntents;
  renameButton: RefObject<HTMLButtonElement | null>;
  deleteButton: RefObject<HTMLButtonElement | null>;
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
  buttonRef?: RefObject<HTMLButtonElement | null>;
  onPress: () => void;
}
