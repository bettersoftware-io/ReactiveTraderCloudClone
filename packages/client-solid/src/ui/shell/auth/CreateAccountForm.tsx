import { createSignal, type JSX, Show } from "solid-js";

import type { AccountAccessState, RegistrationInput } from "@rtc/core-api";
import { ACCOUNT_ACCESS_COPY, PRIVACY_NOTICE_URL } from "@rtc/core-logic";

import { PasswordChecklist } from "./PasswordChecklist";

import styles from "./LoginScreen.module.css";

/**
 * The create-account form: email, display name and a new password with its
 * live checklist. It registers with exactly what was typed — normalizing is
 * the machine's job. Dumb component: the fields live in local signals only
 * and are never logged.
 */
export function CreateAccountForm(props: CreateAccountFormProps): JSX.Element {
  const [email, setEmail] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [password, setPassword] = createSignal("");

  function submitRegistration(event: SubmitEvent): void {
    event.preventDefault();
    props.onRegister({
      email: email(),
      displayName: displayName(),
      password: password(),
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
            data-testid="login-email"
            class={styles.input}
            type="email"
            autocomplete="email"
            value={email()}
            onInput={changeEmail}
          />
        </label>

        <label class={styles.field}>
          <span class={styles.label}>
            {ACCOUNT_ACCESS_COPY.displayNameLabel}
          </span>
          <input
            data-testid="login-display-name"
            class={styles.input}
            type="text"
            autocomplete="nickname"
            value={displayName()}
            onInput={changeDisplayName}
          />
        </label>

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
          <div data-testid="login-error" class={styles.error}>
            {props.state.error}
          </div>
        </Show>

        <button
          type="submit"
          data-testid="login-submit"
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
          class={styles.link}
          onClick={startCodeEntry}
        >
          {ACCOUNT_ACCESS_COPY.haveCodeLink}
        </button>
        <button
          type="button"
          data-testid="login-back"
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
