import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useRef,
  useState,
} from "react";

import type { AccountAccessState, CodeInput } from "@rtc/core-api";
import {
  ACCOUNT_ACCESS_COPY,
  type AccountField,
  checkCodeInput,
  checkEmailInput,
  type InputCheck,
} from "@rtc/core-logic";

import { FieldError } from "./FieldError";
import { fieldAriaProps } from "./fieldErrorId";
import { keepFieldFocus } from "./keepFieldFocus";
import { PasswordChecklist } from "./PasswordChecklist";
import { useFieldReveal } from "./useFieldReveal";

import styles from "./LoginScreen.module.css";

/**
 * The code step of either flow. It names the address the code went to when
 * the machine holds one (else asks for it), and asks for a password only when
 * the machine holds none. The address (when asked for) and the code each
 * show their check's error under the field once it has been left; a submit
 * reveals them and sends nothing while one fails, focusing the first that
 * does. It submits exactly the fields it showed. Dumb component: the code
 * and password live in local state only and are never logged.
 */
export function EnterCodeForm({
  state,
  onSubmit,
  onResend,
  onBack,
}: EnterCodeFormProps): ReactElement {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const fields = useFieldReveal();
  const emailInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  const asksEmail = state.email === null;
  const asksPassword = !state.passwordHeld;
  const resetting = state.flow === "reset";

  const emailCheck = checkEmailInput(email);
  const codeCheck = checkCodeInput(code);
  const emailError = fields.describeError("email", emailCheck);
  const codeError = fields.describeError("code", codeCheck);

  function submitCode(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    // Only the fields on screen: a held address is not the form's to check.
    const codeField: readonly [AccountField, InputCheck] = ["code", codeCheck];
    const failing = fields.revealAll(
      asksEmail ? [["email", emailCheck], codeField] : [codeField],
    );

    if (failing !== null) {
      (failing === "email" ? emailInput : codeInput).current?.focus();

      return;
    }

    onSubmit({
      ...(asksEmail ? { email } : {}),
      code,
      ...(asksPassword ? { password } : {}),
    });
  }

  /** A held address is the machine's to name. A typed one is gated like a
   * submit, on the address alone: one that fails shows its error under the
   * field, takes the focus and sends nothing; one that passes is passed on. */
  function resendCode(): void {
    if (!asksEmail) {
      onResend(undefined);

      return;
    }

    if (!emailCheck.ok) {
      revealEmailError();
      emailInput.current?.focus();

      return;
    }

    onResend(email);
  }

  function revealEmailError(): void {
    fields.reveal("email");
  }

  function revealCodeError(): void {
    fields.reveal("code");
  }

  function changeEmail(event: ChangeEvent<HTMLInputElement>): void {
    setEmail(event.target.value);
  }

  function changeCode(event: ChangeEvent<HTMLInputElement>): void {
    setCode(event.target.value);
  }

  function changePassword(event: ChangeEvent<HTMLInputElement>): void {
    setPassword(event.target.value);
  }

  return (
    <>
      <form className={styles.form} noValidate onSubmit={submitCode}>
        {state.email !== null ? (
          <div data-testid="login-code-email" className={styles.sentTo}>
            {ACCOUNT_ACCESS_COPY.codeSentTo} <strong>{state.email}</strong>
          </div>
        ) : (
          <label className={styles.field}>
            <span className={styles.label}>
              {ACCOUNT_ACCESS_COPY.emailLabel}
            </span>
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
        )}
        {asksEmail ? <FieldError field="email" error={emailError} /> : null}

        <label className={styles.field}>
          <span className={styles.label}>{ACCOUNT_ACCESS_COPY.codeLabel}</span>
          <input
            ref={codeInput}
            data-testid="login-code"
            className={styles.input}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            {...fieldAriaProps("code", codeError)}
            value={code}
            onChange={changeCode}
            onBlur={revealCodeError}
          />
        </label>
        <FieldError field="code" error={codeError} />

        {asksPassword ? (
          <>
            <label className={styles.field}>
              <span className={styles.label}>
                {resetting
                  ? ACCOUNT_ACCESS_COPY.newPasswordLabel
                  : ACCOUNT_ACCESS_COPY.passwordLabel}
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
          </>
        ) : null}

        {state.resent ? (
          <div data-testid="login-resent" className={styles.resent}>
            {ACCOUNT_ACCESS_COPY.codeResent}
          </div>
        ) : null}

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
          {describeSubmit(state.busy, resetting)}
        </button>
      </form>

      <div className={styles.links}>
        <button
          type="button"
          data-testid="login-resend"
          onMouseDown={keepFieldFocus}
          className={styles.link}
          disabled={state.busy}
          onClick={resendCode}
        >
          {ACCOUNT_ACCESS_COPY.resendLink}
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

/** SENDING while a request is out; else the flow's own submit label. */
function describeSubmit(busy: boolean, resetting: boolean): string {
  if (busy) {
    return ACCOUNT_ACCESS_COPY.busySubmit;
  }

  return resetting
    ? ACCOUNT_ACCESS_COPY.setPasswordSubmit
    : ACCOUNT_ACCESS_COPY.confirmSubmit;
}

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
