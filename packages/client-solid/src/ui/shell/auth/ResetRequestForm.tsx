import { createSignal, type JSX, Show } from "solid-js";

import type { AccountAccessState } from "@rtc/core-api";
import {
  ACCOUNT_ACCESS_COPY,
  checkEmailInput,
  describeFieldError,
} from "@rtc/core-logic";

import { FieldError } from "./FieldError";
import { fieldErrorId } from "./fieldErrorId";
import { keepFieldFocus } from "./keepFieldFocus";

import styles from "./LoginScreen.module.css";

/**
 * "Forgot password?": asks for the address a reset code goes to. The
 * address shows its check's error under the field once it has been left; a
 * submit reveals it and sends nothing while it fails. Dumb component: the
 * address lives in a local signal and leaves through `onRequest`.
 */
export function ResetRequestForm(props: ResetRequestFormProps): JSX.Element {
  const [email, setEmail] = createSignal("");
  const [emailRevealed, setEmailRevealed] = createSignal(false);
  let emailInput: HTMLInputElement | undefined;

  function emailError(): string | null {
    return describeFieldError(checkEmailInput(email()), emailRevealed());
  }

  function submitResetRequest(event: SubmitEvent): void {
    event.preventDefault();
    setEmailRevealed(true);

    if (!checkEmailInput(email()).ok) {
      emailInput?.focus();

      return;
    }

    props.onRequest(email());
  }

  function revealEmailError(): void {
    setEmailRevealed(true);
  }

  function changeEmail(event: InputChangeEvent): void {
    setEmail(event.currentTarget.value);
  }

  function returnToSignIn(): void {
    props.onBack();
  }

  return (
    <>
      <form class={styles.form} noValidate onSubmit={submitResetRequest}>
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
            : ACCOUNT_ACCESS_COPY.requestResetSubmit}
        </button>
      </form>

      <div class={styles.links}>
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

interface ResetRequestFormProps {
  readonly state: RequestResetPhase;
  readonly onRequest: (email: string) => void;
  readonly onBack: () => void;
}

interface RequestResetPhaseTag {
  readonly phase: "requestReset";
}

type RequestResetPhase = Extract<AccountAccessState, RequestResetPhaseTag>;
