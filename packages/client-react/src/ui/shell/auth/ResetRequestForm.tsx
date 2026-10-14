import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useState,
} from "react";

import type { AccountAccessState } from "@rtc/core-api";
import { ACCOUNT_ACCESS_COPY } from "@rtc/core-logic";

import styles from "./LoginScreen.module.css";

/**
 * "Forgot password?": asks for the address a reset code goes to. Dumb
 * component: the address lives in local state and leaves through `onRequest`.
 */
export function ResetRequestForm({
  state,
  onRequest,
  onBack,
}: ResetRequestFormProps): ReactElement {
  const [email, setEmail] = useState("");

  function submitResetRequest(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onRequest(email);
  }

  function changeEmail(event: ChangeEvent<HTMLInputElement>): void {
    setEmail(event.target.value);
  }

  return (
    <>
      <form className={styles.form} noValidate onSubmit={submitResetRequest}>
        <label className={styles.field}>
          <span className={styles.label}>{ACCOUNT_ACCESS_COPY.emailLabel}</span>
          <input
            data-testid="login-email"
            className={styles.input}
            type="email"
            autoComplete="email"
            value={email}
            onChange={changeEmail}
          />
        </label>

        {state.error !== null ? (
          <div data-testid="login-error" className={styles.error}>
            {state.error}
          </div>
        ) : null}

        <button
          type="submit"
          data-testid="login-submit"
          className={styles.submit}
          disabled={state.busy}
        >
          {state.busy
            ? ACCOUNT_ACCESS_COPY.busySubmit
            : ACCOUNT_ACCESS_COPY.requestResetSubmit}
        </button>
      </form>

      <div className={styles.links}>
        <button
          type="button"
          data-testid="login-back"
          className={styles.link}
          onClick={onBack}
        >
          {ACCOUNT_ACCESS_COPY.backToSignInLink}
        </button>
      </div>
    </>
  );
}

interface ResetRequestFormProps {
  readonly state: RequestResetPhase;
  readonly onRequest: (email: string) => void;
  readonly onBack: () => void;
}

interface RequestResetPhaseTag {
  readonly phase: "requestReset";
}

type RequestResetPhase = Extract<AccountAccessState, RequestResetPhaseTag>;
