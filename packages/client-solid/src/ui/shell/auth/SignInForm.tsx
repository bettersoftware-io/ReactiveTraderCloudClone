import { createSignal, type JSX, Show } from "solid-js";

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
 * signals only and are never logged; every intent leaves through a slot.
 */
export function SignInForm(props: SignInFormProps): JSX.Element {
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  let submitButton: HTMLButtonElement | undefined;

  function authenticating(): boolean {
    return props.auth.status === "authenticating";
  }

  function submitLogin(event: SubmitEvent): void {
    event.preventDefault();
    props.onLogin(username(), password());
  }

  function changeUsername(event: InputChangeEvent): void {
    setUsername(event.currentTarget.value);
  }

  function changePassword(event: InputChangeEvent): void {
    setPassword(event.currentTarget.value);
  }

  /** A picked demo account fills both fields and hands focus to AUTHENTICATE,
   * so the next Enter signs in — the pick itself never does. */
  function stageSignIn(account: DemoAccount): void {
    setUsername(account.username);
    setPassword(account.password);
    submitButton?.focus();
  }

  function startCodeEntry(): void {
    props.onEnterCode();
  }

  function startRegistration(): void {
    props.onCreateAccount();
  }

  function startReset(): void {
    props.onForgotPassword();
  }

  return (
    <>
      <form class={styles.form} onSubmit={submitLogin}>
        <div
          class={
            authenticating()
              ? `${waitStyles.fields} ${waitStyles.recede}`
              : waitStyles.fields
          }
        >
          <label class={styles.field}>
            <span class={styles.label}>Username</span>
            <input
              data-testid="login-username"
              class={styles.input}
              type="text"
              autocomplete="username"
              value={username()}
              onInput={changeUsername}
            />
          </label>

          <label class={styles.field}>
            <span class={styles.label}>Password</span>
            <input
              data-testid="login-password"
              class={styles.input}
              type="password"
              autocomplete="current-password"
              value={password()}
              onInput={changePassword}
            />
          </label>
        </div>

        <Show when={props.auth.error !== null}>
          <div data-testid="login-error" role="alert" class={styles.error}>
            {props.auth.error}
          </div>
        </Show>

        <Show
          when={
            props.auth.failure === "unconfirmed" && props.registrationAvailable
          }
        >
          <button
            type="button"
            data-testid="login-enter-code"
            class={styles.link}
            onClick={startCodeEntry}
          >
            {ACCOUNT_ACCESS_COPY.enterCodeAfterUnconfirmed}
          </button>
        </Show>

        <button
          ref={submitButton}
          type="submit"
          data-testid="login-submit"
          class={
            authenticating()
              ? `${styles.submit} ${waitStyles.busy}`
              : styles.submit
          }
          disabled={authenticating()}
        >
          {authenticating() ? "AUTHENTICATING" : "AUTHENTICATE ▸"}
        </button>

        <Show when={authenticating() && props.auth.waitVariant === "handshake"}>
          <HandshakeConsole />
        </Show>
        <Show when={authenticating() && props.auth.waitVariant === "reactor"}>
          <ReactorWait />
        </Show>
      </form>

      <DemoAccountsHint
        accounts={props.demoAccounts}
        busy={authenticating()}
        onPick={stageSignIn}
      />

      <Show when={props.registrationAvailable}>
        <div class={styles.links}>
          <button
            type="button"
            data-testid="login-create-account"
            class={styles.link}
            disabled={authenticating()}
            onClick={startRegistration}
          >
            {ACCOUNT_ACCESS_COPY.createAccountLink}
          </button>
          <button
            type="button"
            data-testid="login-forgot-password"
            class={styles.link}
            disabled={authenticating()}
            onClick={startReset}
          >
            {ACCOUNT_ACCESS_COPY.forgotPasswordLink}
          </button>
        </div>
      </Show>
    </>
  );
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };

interface SignInFormProps {
  readonly auth: AuthViewState;
  readonly registrationAvailable: boolean;
  readonly demoAccounts: readonly DemoAccount[];
  readonly onLogin: (username: string, password: string) => void;
  readonly onCreateAccount: () => void;
  readonly onForgotPassword: () => void;
  readonly onEnterCode: () => void;
}
