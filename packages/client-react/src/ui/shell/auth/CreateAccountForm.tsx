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
  describeFieldError,
  findFirstFailingField,
  PRIVACY_NOTICE_URL,
} from "@rtc/core-logic";

import { FieldError } from "./FieldError";
import { fieldErrorId } from "./fieldErrorId";
import { keepFieldFocus } from "./keepFieldFocus";
import { PasswordChecklist } from "./PasswordChecklist";

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
  const [revealed, setRevealed] =
    useState<ReadonlySet<AccountField>>(NOTHING_REVEALED);
  const emailInput = useRef<HTMLInputElement>(null);
  const displayNameInput = useRef<HTMLInputElement>(null);

  const emailCheck = checkEmailInput(email);
  const displayNameCheck = checkDisplayNameInput(displayName);
  const emailError = describeFieldError(emailCheck, revealed.has("email"));
  const displayNameError = describeFieldError(
    displayNameCheck,
    revealed.has("display-name"),
  );

  function submitRegistration(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setRevealed(EVERY_FIELD_REVEALED);
    const failing = findFirstFailingField([
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
    setRevealed((shown) => {
      return new Set(shown).add("email");
    });
  }

  function revealDisplayNameError(): void {
    setRevealed((shown) => {
      return new Set(shown).add("display-name");
    });
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
            aria-invalid={emailError !== null}
            aria-describedby={
              emailError === null ? undefined : fieldErrorId("email")
            }
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
            aria-invalid={displayNameError !== null}
            aria-describedby={
              displayNameError === null
                ? undefined
                : fieldErrorId("display-name")
            }
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

const NOTHING_REVEALED: ReadonlySet<AccountField> = new Set();

const EVERY_FIELD_REVEALED: ReadonlySet<AccountField> = new Set([
  "email",
  "display-name",
]);

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
