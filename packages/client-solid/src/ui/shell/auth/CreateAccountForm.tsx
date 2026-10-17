import { createSignal, type JSX, Show } from "solid-js";

import type { AccountAccessState, RegistrationInput } from "@rtc/core-api";
import {
  ACCOUNT_ACCESS_COPY,
  type AccountField,
  checkDisplayNameInput,
  checkEmailInput,
  checkPasswordInput,
  PRIVACY_NOTICE_URL,
} from "@rtc/core-logic";

import { createFieldReveal } from "./createFieldReveal";
import { FieldError } from "./FieldError";
import { fieldAriaProps } from "./fieldErrorId";
import { keepFieldFocus } from "./keepFieldFocus";
import { PasswordChecklist } from "./PasswordChecklist";

import styles from "./LoginScreen.module.css";

/**
 * The create-account form: email, display name and a new password with its
 * live checklist. Each field shows its check's error under it once it has
 * been left; a submit reveals all three and sends nothing while one fails,
 * focusing the first that does. It
 * registers with exactly what was typed — normalizing is the machine's job.
 * Dumb component: the fields live in local signals only and are never
 * logged.
 */
export function CreateAccountForm(props: CreateAccountFormProps): JSX.Element {
  const [email, setEmail] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [password, setPassword] = createSignal("");
  const fields = createFieldReveal();
  let emailInput: HTMLInputElement | undefined;
  let displayNameInput: HTMLInputElement | undefined;
  let passwordInput: HTMLInputElement | undefined;

  function emailError(): string | null {
    return fields.describeError("email", checkEmailInput(email()));
  }

  function displayNameError(): string | null {
    return fields.describeError(
      "display-name",
      checkDisplayNameInput(displayName()),
    );
  }

  function passwordError(): string | null {
    return fields.describeError("password", checkPasswordInput(password()));
  }

  function submitRegistration(event: SubmitEvent): void {
    event.preventDefault();
    const failing = fields.revealAll([
      ["email", checkEmailInput(email())],
      ["display-name", checkDisplayNameInput(displayName())],
      ["password", checkPasswordInput(password())],
    ]);

    if (failing !== null) {
      focusField(failing);

      return;
    }

    props.onRegister({
      email: email(),
      displayName: displayName(),
      password: password(),
    });
  }

  function revealEmailError(): void {
    fields.reveal("email");
  }

  function focusField(field: AccountField): void {
    const inputs: Partial<Record<AccountField, HTMLInputElement | undefined>> =
      {
        email: emailInput,
        "display-name": displayNameInput,
        password: passwordInput,
      };

    inputs[field]?.focus();
  }

  function revealDisplayNameError(): void {
    fields.reveal("display-name");
  }

  function revealPasswordError(): void {
    fields.reveal("password");
  }

  function changeEmail(event: InputChangeEvent): void {
    setEmail(event.currentTarget.value);
  }

  function changeDisplayName(event: InputChangeEvent): void {
    setDisplayName(event.currentTarget.value);
  }

  function changePassword(event: InputChangeEvent): void {
    setPassword(event.currentTarget.value);
  }

  function returnToSignIn(): void {
    props.onBack();
  }

  function startCodeEntry(): void {
    props.onHaveCode();
  }

  return (
    <>
      <form class={styles.form} noValidate onSubmit={submitRegistration}>
        <label class={styles.field}>
          <span class={styles.label}>{ACCOUNT_ACCESS_COPY.emailLabel}</span>
          <input
            ref={emailInput}
            data-testid="login-email"
            class={styles.input}
            type="email"
            autocomplete="email"
            {...fieldAriaProps("email", emailError())}
            value={email()}
            onInput={changeEmail}
            onBlur={revealEmailError}
          />
        </label>
        <FieldError field="email" error={emailError()} />

        <label class={styles.field}>
          <span class={styles.label}>
            {ACCOUNT_ACCESS_COPY.displayNameLabel}
          </span>
          <input
            ref={displayNameInput}
            data-testid="login-display-name"
            class={styles.input}
            type="text"
            autocomplete="nickname"
            {...fieldAriaProps("display-name", displayNameError())}
            value={displayName()}
            onInput={changeDisplayName}
            onBlur={revealDisplayNameError}
          />
        </label>
        <FieldError field="display-name" error={displayNameError()} />

        <label class={styles.field}>
          <span class={styles.label}>{ACCOUNT_ACCESS_COPY.passwordLabel}</span>
          <input
            ref={passwordInput}
            data-testid="login-new-password"
            class={styles.input}
            type="password"
            autocomplete="new-password"
            {...fieldAriaProps("password", passwordError())}
            value={password()}
            onInput={changePassword}
            onBlur={revealPasswordError}
          />
        </label>
        <FieldError field="password" error={passwordError()} />
        <PasswordChecklist password={password()} />

        <Show when={props.state.error !== null}>
          <div data-testid="login-error" role="alert" class={styles.error}>
            {props.state.error}
          </div>
        </Show>

        <button
          type="submit"
          data-testid="login-submit"
          onMouseDown={keepFieldFocus}
          class={styles.submit}
          disabled={props.state.busy}
        >
          {props.state.busy
            ? ACCOUNT_ACCESS_COPY.busySubmit
            : ACCOUNT_ACCESS_COPY.registerSubmit}
        </button>

        <div class={styles.privacy}>
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

      <div class={styles.links}>
        <button
          type="button"
          data-testid="login-have-code"
          onMouseDown={keepFieldFocus}
          class={styles.link}
          onClick={startCodeEntry}
        >
          {ACCOUNT_ACCESS_COPY.haveCodeLink}
        </button>
        <button
          type="button"
          data-testid="login-back"
          onMouseDown={keepFieldFocus}
          class={styles.link}
          onClick={returnToSignIn}
        >
          {ACCOUNT_ACCESS_COPY.backToSignInLink}
        </button>
      </div>
    </>
  );
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };

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
