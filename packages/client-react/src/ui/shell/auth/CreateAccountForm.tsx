import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useRef,
  useState,
} from "react";

import type { AccountAccessState, RegistrationInput } from "@rtc/core-api";
import {
  ACCOUNT_ACCESS_COPY,
  checkDisplayNameInput,
  checkEmailInput,
  PRIVACY_NOTICE_URL,
} from "@rtc/core-logic";

import { FieldError } from "./FieldError";
import { fieldAriaProps } from "./fieldErrorId";
import { keepFieldFocus } from "./keepFieldFocus";
import { PasswordChecklist } from "./PasswordChecklist";
import { useFieldReveal } from "./useFieldReveal";

import styles from "./LoginScreen.module.css";

/**
 * The create-account form: email, display name and a new password with its
 * live checklist. The address and the display name each show their check's
 * error under the field once it has been left; a submit reveals both and
 * sends nothing while either fails, focusing the first that does. It
 * registers with exactly what was typed — normalizing is the machine's job.
 * Dumb component: the fields live in local state only and are never logged.
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
  const fields = useFieldReveal();
  const emailInput = useRef<HTMLInputElement>(null);
  const displayNameInput = useRef<HTMLInputElement>(null);

  const emailCheck = checkEmailInput(email);
  const displayNameCheck = checkDisplayNameInput(displayName);
  const emailError = fields.describeError("email", emailCheck);
  const displayNameError = fields.describeError(
    "display-name",
    displayNameCheck,
  );

  function submitRegistration(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const failing = fields.revealAll([
      ["email", emailCheck],
      ["display-name", displayNameCheck],
    ]);

    if (failing !== null) {
      (failing === "email" ? emailInput : displayNameInput).current?.focus();

      return;
    }

    onRegister({ email, displayName, password });
  }

  function revealEmailError(): void {
    fields.reveal("email");
  }

  function revealDisplayNameError(): void {
    fields.reveal("display-name");
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
            ref={emailInput}
            data-testid="login-email"
            className={styles.input}
            type="email"
            autoComplete="email"
            {...fieldAriaProps("email", emailError)}
            value={email}
            onChange={changeEmail}
            onBlur={revealEmailError}
          />
        </label>
        <FieldError field="email" error={emailError} />

        <label className={styles.field}>
          <span className={styles.label}>
            {ACCOUNT_ACCESS_COPY.displayNameLabel}
          </span>
          <input
            ref={displayNameInput}
            data-testid="login-display-name"
            className={styles.input}
            type="text"
            autoComplete="nickname"
            {...fieldAriaProps("display-name", displayNameError)}
            value={displayName}
            onChange={changeDisplayName}
            onBlur={revealDisplayNameError}
          />
        </label>
        <FieldError field="display-name" error={displayNameError} />

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
          <div data-testid="login-error" role="alert" className={styles.error}>
            {state.error}
          </div>
        ) : null}

        <button
          type="submit"
          data-testid="login-submit"
          onMouseDown={keepFieldFocus}
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
            onMouseDown={keepFieldFocus}
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
          onMouseDown={keepFieldFocus}
          className={styles.link}
          onClick={onHaveCode}
        >
          {ACCOUNT_ACCESS_COPY.haveCodeLink}
        </button>
        <button
          type="button"
          data-testid="login-back"
          onMouseDown={keepFieldFocus}
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
