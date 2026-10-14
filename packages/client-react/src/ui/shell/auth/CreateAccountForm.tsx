import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useState,
} from "react";

import type { AccountAccessState, RegistrationInput } from "@rtc/core-api";
import { ACCOUNT_ACCESS_COPY, PRIVACY_NOTICE_URL } from "@rtc/core-logic";

import { PasswordChecklist } from "./PasswordChecklist";

import styles from "./LoginScreen.module.css";

/**
 * The create-account form: email, display name and a new password with its
 * live checklist. It registers with exactly what was typed — normalizing is
 * the machine's job. Dumb component: the fields live in local state only and
 * are never logged.
 */
export function CreateAccountForm({
  state,
  onRegister,
  onHaveCode,
  onBack,
}: CreateAccountFormProps): ReactElement {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  function submitRegistration(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onRegister({ email, displayName, password });
  }

  function changeEmail(event: ChangeEvent<HTMLInputElement>): void {
    setEmail(event.target.value);
  }

  function changeDisplayName(event: ChangeEvent<HTMLInputElement>): void {
    setDisplayName(event.target.value);
  }

  function changePassword(event: ChangeEvent<HTMLInputElement>): void {
    setPassword(event.target.value);
  }

  return (
    <>
      <form className={styles.form} noValidate onSubmit={submitRegistration}>
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

        <label className={styles.field}>
          <span className={styles.label}>
            {ACCOUNT_ACCESS_COPY.displayNameLabel}
          </span>
          <input
            data-testid="login-display-name"
            className={styles.input}
            type="text"
            autoComplete="nickname"
            value={displayName}
            onChange={changeDisplayName}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            {ACCOUNT_ACCESS_COPY.passwordLabel}
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
            : ACCOUNT_ACCESS_COPY.registerSubmit}
        </button>

        <div className={styles.privacy}>
          {ACCOUNT_ACCESS_COPY.privacyLead}{" "}
          <a
            data-testid="login-privacy"
            href={PRIVACY_NOTICE_URL}
            target="_blank"
            rel="noreferrer"
          >
            {ACCOUNT_ACCESS_COPY.privacyLink}
          </a>
        </div>
      </form>

      <div className={styles.links}>
        <button
          type="button"
          data-testid="login-have-code"
          className={styles.link}
          onClick={onHaveCode}
        >
          {ACCOUNT_ACCESS_COPY.haveCodeLink}
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

interface CreateAccountFormProps {
  readonly state: RegisterPhase;
  readonly onRegister: (input: RegistrationInput) => void;
  readonly onHaveCode: () => void;
  readonly onBack: () => void;
}

interface RegisterPhaseTag {
  readonly phase: "register";
}

type RegisterPhase = Extract<AccountAccessState, RegisterPhaseTag>;
