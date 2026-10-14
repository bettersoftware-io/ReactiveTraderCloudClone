import { createSignal, type JSX, Show } from "solid-js";

import type { AccountAccessState } from "@rtc/core-api";
import { ACCOUNT_ACCESS_COPY } from "@rtc/core-logic";

import styles from "./LoginScreen.module.css";

/**
 * "Forgot password?": asks for the address a reset code goes to. Dumb
 * component: the address lives in a local signal and leaves through
 * `onRequest`.
 */
export function ResetRequestForm(props: ResetRequestFormProps): JSX.Element {
  const [email, setEmail] = createSignal("");

  function submitResetRequest(event: SubmitEvent): void {
    event.preventDefault();
    props.onRequest(email());
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
            data-testid="login-email"
            class={styles.input}
            type="email"
            autocomplete="email"
            value={email()}
            onInput={changeEmail}
          />
        </label>

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
            : ACCOUNT_ACCESS_COPY.requestResetSubmit}
        </button>
      </form>

      <div class={styles.links}>
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

interface ResetRequestFormProps {
  readonly state: RequestResetPhase;
  readonly onRequest: (email: string) => void;
  readonly onBack: () => void;
}

interface RequestResetPhaseTag {
  readonly phase: "requestReset";
}

type RequestResetPhase = Extract<AccountAccessState, RequestResetPhaseTag>;
