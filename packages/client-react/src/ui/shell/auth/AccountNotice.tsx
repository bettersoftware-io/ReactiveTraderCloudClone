import type { ReactElement } from "react";

import type { AccountAccessState } from "@rtc/core-api";
import { ACCOUNT_ACCESS_COPY } from "@rtc/core-logic";

import styles from "./LoginScreen.module.css";

/**
 * The end of a flow: what happened, for which address, and one action —
 * request a reset code when no password could be stored, else back to
 * sign-in. Dumb component.
 */
export function AccountNotice({
  state,
  onRequestReset,
  onSignIn,
}: AccountNoticeProps): ReactElement {
  const passwordUnset = state.phase === "passwordUnset";

  function takeNoticeAction(): void {
    if (passwordUnset) {
      onRequestReset(state.email);
    } else {
      onSignIn();
    }
  }

  return (
    <>
      <p data-testid="login-notice" className={styles.notice}>
        {describeNotice(state)}
        <br />
        {state.email}
      </p>

      <button
        type="button"
        data-testid="login-notice-action"
        className={styles.submit}
        onClick={takeNoticeAction}
      >
        {passwordUnset
          ? ACCOUNT_ACCESS_COPY.requestResetAction
          : ACCOUNT_ACCESS_COPY.signInAction}
      </button>
    </>
  );
}

function describeNotice(state: NoticeState): string {
  switch (state.phase) {
    case "pendingApproval":
      return ACCOUNT_ACCESS_COPY.pendingApprovalNotice;
    case "passwordUnset":
      return ACCOUNT_ACCESS_COPY.passwordUnsetNotice;
    case "passwordChanged":
      return ACCOUNT_ACCESS_COPY.passwordChangedNotice;
  }
}

interface NoticePhaseTag {
  readonly phase: "pendingApproval" | "passwordUnset" | "passwordChanged";
}

type NoticeState = Extract<AccountAccessState, NoticePhaseTag>;

interface AccountNoticeProps {
  readonly state: NoticeState;
  readonly onRequestReset: (email: string) => void;
  readonly onSignIn: () => void;
}
