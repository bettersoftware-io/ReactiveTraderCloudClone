import { createSignal, type JSX, Show } from "solid-js";

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
 * Dumb component: the fields live in local signals only and are never
 * logged.
 */
export function CreateAccountForm(props: CreateAccountFormProps): JSX.Element {
  const [email, setEmail] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [revealed, setRevealed] =
    createSignal<ReadonlySet<AccountField>>(NOTHING_REVEALED);
  let emailInput: HTMLInputElement | undefined;
  let displayNameInput: HTMLInputElement | undefined;

  function emailError(): string | null {
    return describeFieldError(
      checkEmailInput(email()),
      revealed().has("email"),
    );
  }

  function displayNameError(): string | null {
    return describeFieldError(
      checkDisplayNameInput(displayName()),
      revealed().has("display-name"),
    );
  }

  function submitRegistration(event: SubmitEvent): void {
    event.preventDefault();
    setRevealed(EVERY_FIELD_REVEALED);
    const failing = findFirstFailingField([
      ["email", checkEmailInput(email())],
      ["display-name", checkDisplayNameInput(displayName())],
    ]);

    if (failing !== null) {
      (failing === "email" ? emailInput : displayNameInput)?.focus();

      return;
    }

    props.onRegister({
      email: email(),
      displayName: displayName(),
      password: password(),
    });
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
            aria-invalid={emailError() !== null}
            aria-describedby={
              emailError() === null ? undefined : fieldErrorId("email")
            }
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
            aria-invalid={displayNameError() !== null}
            aria-describedby={
              displayNameError() === null
                ? undefined
                : fieldErrorId("display-name")
            }
            value={displayName()}
            onInput={changeDisplayName}
            onBlur={revealDisplayNameError}
          />
        </label>
        <FieldError field="display-name" error={displayNameError()} />

        <label class={styles.field}>
          <span class={styles.label}>{ACCOUNT_ACCESS_COPY.passwordLabel}</span>
          <input
            data-testid="login-new-password"
            class={styles.input}
            type="password"
            autocomplete="new-password"
            value={password()}
            onInput={changePassword}
          />
        </label>
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

const NOTHING_REVEALED: ReadonlySet<AccountField> = new Set();

const EVERY_FIELD_REVEALED: ReadonlySet<AccountField> = new Set([
  "email",
  "display-name",
]);

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
