import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useState,
} from "react";

import type { AccountAccessState, CodeInput } from "@rtc/core-api";
import { ACCOUNT_ACCESS_COPY } from "@rtc/core-logic";

import { PasswordChecklist } from "./PasswordChecklist";

import styles from "./LoginScreen.module.css";

/**
 * The code step of either flow. It names the address the code went to when
 * the machine holds one (else asks for it), and asks for a password only when
 * the machine holds none. It submits exactly the fields it showed. Dumb
 * component: the code and password live in local state only and are never
 * logged.
 */
export function EnterCodeForm({
  state,
  onSubmit,
  onResend,
  onBack,
}: EnterCodeFormProps): ReactElement {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  const asksEmail = state.email === null;
  const asksPassword = !state.passwordHeld;
  const resetting = state.flow === "reset";

  function submitCode(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({
      ...(asksEmail ? { email } : {}),
      code,
      ...(asksPassword ? { password } : {}),
    });
  }

  /** A held address is the machine's to name; a typed one is passed on. */
  function resendCode(): void {
    onResend(asksEmail ? email : undefined);
  }

  function changeEmail(event: ChangeEvent<HTMLInputElement>): void {
    setEmail(event.target.value);
  }

  function changeCode(event: ChangeEvent<HTMLInputElement>): void {
    setCode(event.target.value);
  }

  function changePassword(event: ChangeEvent<HTMLInputElement>): void {
    setPassword(event.target.value);
  }

  return (
    <>
      <form className={styles.form} noValidate onSubmit={submitCode}>
        {state.email !== null ? (
          <div data-testid="login-code-email" className={styles.sentTo}>
            {ACCOUNT_ACCESS_COPY.codeSentTo} <strong>{state.email}</strong>
          </div>
        ) : (
          <label className={styles.field}>
            <span className={styles.label}>
              {ACCOUNT_ACCESS_COPY.emailLabel}
            </span>
            <input
              data-testid="login-email"
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={changeEmail}
            />
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.label}>{ACCOUNT_ACCESS_COPY.codeLabel}</span>
          <input
            data-testid="login-code"
            className={styles.input}
            type="text"
            inputMode="numeric"
            maxLength={8}
            autoComplete="one-time-code"
            value={code}
            onChange={changeCode}
          />
        </label>

        {asksPassword ? (
          <>
            <label className={styles.field}>
              <span className={styles.label}>
                {resetting
                  ? ACCOUNT_ACCESS_COPY.newPasswordLabel
                  : ACCOUNT_ACCESS_COPY.passwordLabel}
              </span>
              <input
                data-testid="login-new-password"
                className={styles.input}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={changePassword}
              />
            </label>
            <PasswordChecklist password={password} />
          </>
        ) : null}

        {state.resent ? (
          <div data-testid="login-resent" className={styles.resent}>
            {ACCOUNT_ACCESS_COPY.codeResent}
          </div>
        ) : null}

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
          {describeSubmit(state.busy, resetting)}
        </button>
      </form>

      <div className={styles.links}>
        <button
          type="button"
          data-testid="login-resend"
          className={styles.link}
          onClick={resendCode}
        >
          {ACCOUNT_ACCESS_COPY.resendLink}
        </button>
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

/** SENDING while a request is out; else the flow's own submit label. */
function describeSubmit(busy: boolean, resetting: boolean): string {
  if (busy) {
    return ACCOUNT_ACCESS_COPY.busySubmit;
  }

  return resetting
    ? ACCOUNT_ACCESS_COPY.setPasswordSubmit
    : ACCOUNT_ACCESS_COPY.confirmSubmit;
}

interface EnterCodeFormProps {
  readonly state: CodePhase;
  readonly onSubmit: (input: CodeInput) => void;
  readonly onResend: (email?: string) => void;
  readonly onBack: () => void;
}

interface CodePhaseTag {
  readonly phase: "code";
}

type CodePhase = Extract<AccountAccessState, CodePhaseTag>;
