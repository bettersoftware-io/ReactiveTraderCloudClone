import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useRef,
  useState,
} from "react";

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
 * address lives in local state and leaves through `onRequest`.
 */
export function ResetRequestForm({
  state,
  onRequest,
  onBack,
}: ResetRequestFormProps): ReactElement {
  const [email, setEmail] = useState("");
  const [emailRevealed, setEmailRevealed] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);

  const emailCheck = checkEmailInput(email);
  const emailError = describeFieldError(emailCheck, emailRevealed);

  function submitResetRequest(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setEmailRevealed(true);

    if (!emailCheck.ok) {
      emailInput.current?.focus();

      return;
    }

    onRequest(email);
  }

  function revealEmailError(): void {
    setEmailRevealed(true);
  }

  function changeEmail(event: ChangeEvent<HTMLInputElement>): void {
    setEmail(event.target.value);
  }

  return (
    <>
      <form className={styles.form} noValidate onSubmit={submitResetRequest}>
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
            : ACCOUNT_ACCESS_COPY.requestResetSubmit}
        </button>
      </form>

      <div className={styles.links}>
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

interface ResetRequestFormProps {
  readonly state: RequestResetPhase;
  readonly onRequest: (email: string) => void;
  readonly onBack: () => void;
}

interface RequestResetPhaseTag {
  readonly phase: "requestReset";
}

type RequestResetPhase = Extract<AccountAccessState, RequestResetPhaseTag>;
