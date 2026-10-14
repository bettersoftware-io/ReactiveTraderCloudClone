import { createSignal, type JSX, Show } from "solid-js";

import type { AccountAccessState, CodeInput } from "@rtc/core-api";
import { ACCOUNT_ACCESS_COPY } from "@rtc/core-logic";

import { PasswordChecklist } from "./PasswordChecklist";

import styles from "./LoginScreen.module.css";

/**
 * The code step of either flow. It names the address the code went to when
 * the machine holds one (else asks for it), and asks for a password only when
 * the machine holds none. It submits exactly the fields it showed. Dumb
 * component: the code and password live in local signals only and are never
 * logged.
 */
export function EnterCodeForm(props: EnterCodeFormProps): JSX.Element {
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [password, setPassword] = createSignal("");

  function asksEmail(): boolean {
    return props.state.email === null;
  }

  function asksPassword(): boolean {
    return !props.state.passwordHeld;
  }

  function resetting(): boolean {
    return props.state.flow === "reset";
  }

  function submitCode(event: SubmitEvent): void {
    event.preventDefault();
    props.onSubmit({
      ...(asksEmail() ? { email: email() } : {}),
      code: code(),
      ...(asksPassword() ? { password: password() } : {}),
    });
  }

  /** A held address is the machine's to name; a typed one is passed on. */
  function resendCode(): void {
    props.onResend(asksEmail() ? email() : undefined);
  }

  function changeEmail(event: InputChangeEvent): void {
    setEmail(event.currentTarget.value);
  }

  function changeCode(event: InputChangeEvent): void {
    setCode(event.currentTarget.value);
  }

  function changePassword(event: InputChangeEvent): void {
    setPassword(event.currentTarget.value);
  }

  function returnToSignIn(): void {
    props.onBack();
  }

  return (
    <>
      <form class={styles.form} noValidate onSubmit={submitCode}>
        <Show
          when={!asksEmail()}
          fallback={
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
          }
        >
          <div data-testid="login-code-email" class={styles.sentTo}>
            {ACCOUNT_ACCESS_COPY.codeSentTo}{" "}
            <strong>{props.state.email}</strong>
          </div>
        </Show>

        <label class={styles.field}>
          <span class={styles.label}>{ACCOUNT_ACCESS_COPY.codeLabel}</span>
          <input
            data-testid="login-code"
            class={styles.input}
            type="text"
            inputMode="numeric"
            autocomplete="one-time-code"
            value={code()}
            onInput={changeCode}
          />
        </label>

        <Show when={asksPassword()}>
          <label class={styles.field}>
            <span class={styles.label}>
              {resetting()
                ? ACCOUNT_ACCESS_COPY.newPasswordLabel
                : ACCOUNT_ACCESS_COPY.passwordLabel}
            </span>
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
        </Show>

        <Show when={props.state.resent}>
          <div data-testid="login-resent" class={styles.resent}>
            {ACCOUNT_ACCESS_COPY.codeResent}
          </div>
        </Show>

        <Show when={props.state.error !== null}>
          <div data-testid="login-error" role="alert" class={styles.error}>
            {props.state.error}
          </div>
        </Show>

        <button
          type="submit"
          data-testid="login-submit"
          class={styles.submit}
          disabled={props.state.busy}
        >
          {describeSubmit(props.state.busy, resetting())}
        </button>
      </form>

      <div class={styles.links}>
        <button
          type="button"
          data-testid="login-resend"
          class={styles.link}
          disabled={props.state.busy}
          onClick={resendCode}
        >
          {ACCOUNT_ACCESS_COPY.resendLink}
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

/** SENDING while a request is out; else the flow's own submit label. */
function describeSubmit(busy: boolean, resetting: boolean): string {
  if (busy) {
    return ACCOUNT_ACCESS_COPY.busySubmit;
  }

  return resetting
    ? ACCOUNT_ACCESS_COPY.setPasswordSubmit
    : ACCOUNT_ACCESS_COPY.confirmSubmit;
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };

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
