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
  type AccountField,
  checkDisplayNameInput,
  checkEmailInput,
  checkPasswordInput,
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
 * live checklist. Each field shows its check's error under it once it has
 * been left; a submit reveals all three and sends nothing while one fails,
 * focusing the first that does. It
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
  const passwordInput = useRef<HTMLInputElement>(null);

  const emailCheck = checkEmailInput(email);
  const displayNameCheck = checkDisplayNameInput(displayName);
  const passwordCheck = checkPasswordInput(password);
  const emailError = fields.describeError("email", emailCheck);
  const displayNameError = fields.describeError(
    "display-name",
    displayNameCheck,
  );
  const passwordError = fields.describeError("password", passwordCheck);

  function submitRegistration(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const failing = fields.revealAll([
      ["email", emailCheck],
      ["display-name", displayNameCheck],
      ["password", passwordCheck],
    ]);

    if (failing !== null) {
      focusField(failing);

      return;
    }

    onRegister({ email, displayName, password });
  }

  function focusField(field: AccountField): void {
    const inputs: Partial<Record<AccountField, HTMLInputElement | null>> = {
      email: emailInput.current,
      "display-name": displayNameInput.current,
      password: passwordInput.current,
    };

    inputs[field]?.focus();
  }

  function revealEmailError(): void {
    fields.reveal("email");
  }

  function revealDisplayNameError(): void {
    fields.reveal("display-name");
  }

  function revealPasswordError(): void {
    fields.reveal("password");
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
            ref={passwordInput}
            data-testid="login-new-password"
            className={styles.input}
            type="password"
            autoComplete="new-password"
            {...fieldAriaProps("password", passwordError)}
            value={password}
            onChange={changePassword}
            onBlur={revealPasswordError}
          />
        </label>
        <FieldError field="password" error={passwordError} />
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
