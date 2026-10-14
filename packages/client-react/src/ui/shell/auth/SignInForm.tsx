import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useRef,
  useState,
} from "react";

import type { AuthViewState } from "@rtc/core-api";
import { ACCOUNT_ACCESS_COPY } from "@rtc/core-logic";
import type { DemoAccount } from "@rtc/domain";

import { DemoAccountsHint } from "./DemoAccountsHint";
import { HandshakeConsole } from "./wait/HandshakeConsole";
import { ReactorWait } from "./wait/ReactorWait";

import styles from "./LoginScreen.module.css";
import waitStyles from "./wait/authWait.module.css";

/**
 * The sign-in form: username, password, the wait treatments, the error, the
 * demo-accounts hint — and, when the host takes registrations, the links to
 * the account flows. Dumb component: the typed credentials live in local
 * state only and are never logged; every intent leaves through a slot.
 */
export function SignInForm({
  auth,
  registrationAvailable,
  demoAccounts,
  onLogin,
  onCreateAccount,
  onForgotPassword,
  onEnterCode,
}: SignInFormProps): ReactElement {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const submitRef = useRef<HTMLButtonElement>(null);

  function submitLogin(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onLogin(username, password);
  }

  function changeUsername(event: ChangeEvent<HTMLInputElement>): void {
    setUsername(event.target.value);
  }

  function changePassword(event: ChangeEvent<HTMLInputElement>): void {
    setPassword(event.target.value);
  }

  /** A picked demo account fills both fields and hands focus to AUTHENTICATE,
   * so the next Enter signs in — the pick itself never does. */
  function stageSignIn(account: DemoAccount): void {
    setUsername(account.username);
    setPassword(account.password);
    submitRef.current?.focus();
  }

  const authenticating = auth.status === "authenticating";

  return (
    <>
      <form className={styles.form} onSubmit={submitLogin}>
        <div
          className={
            authenticating
              ? `${waitStyles.fields} ${waitStyles.recede}`
              : waitStyles.fields
          }
        >
          <label className={styles.field}>
            <span className={styles.label}>Username</span>
            <input
              data-testid="login-username"
              className={styles.input}
              type="text"
              autoComplete="username"
              value={username}
              onChange={changeUsername}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <input
              data-testid="login-password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={changePassword}
            />
          </label>
        </div>

        {auth.error !== null ? (
          <div data-testid="login-error" role="alert" className={styles.error}>
            {auth.error}
          </div>
        ) : null}

        {auth.failure === "unconfirmed" && registrationAvailable ? (
          <button
            type="button"
            data-testid="login-enter-code"
            className={styles.link}
            onClick={onEnterCode}
          >
            {ACCOUNT_ACCESS_COPY.enterCodeAfterUnconfirmed}
          </button>
        ) : null}

        <button
          ref={submitRef}
          type="submit"
          data-testid="login-submit"
          className={
            authenticating
              ? `${styles.submit} ${waitStyles.busy}`
              : styles.submit
          }
          disabled={authenticating}
        >
          {authenticating ? "AUTHENTICATING" : "AUTHENTICATE ▸"}
        </button>

        {authenticating && auth.waitVariant === "handshake" ? (
          <HandshakeConsole />
        ) : null}
        {authenticating && auth.waitVariant === "reactor" ? (
          <ReactorWait />
        ) : null}
      </form>

      <DemoAccountsHint
        accounts={demoAccounts}
        busy={authenticating}
        onPick={stageSignIn}
      />

      {registrationAvailable ? (
        <div className={styles.links}>
          <button
            type="button"
            data-testid="login-create-account"
            className={styles.link}
            disabled={authenticating}
            onClick={onCreateAccount}
          >
            {ACCOUNT_ACCESS_COPY.createAccountLink}
          </button>
          <button
            type="button"
            data-testid="login-forgot-password"
            className={styles.link}
            disabled={authenticating}
            onClick={onForgotPassword}
          >
            {ACCOUNT_ACCESS_COPY.forgotPasswordLink}
          </button>
        </div>
      ) : null}
    </>
  );
}

interface SignInFormProps {
  readonly auth: AuthViewState;
  readonly registrationAvailable: boolean;
  readonly demoAccounts: readonly DemoAccount[];
  readonly onLogin: (username: string, password: string) => void;
  readonly onCreateAccount: () => void;
  readonly onForgotPassword: () => void;
  readonly onEnterCode: () => void;
}
