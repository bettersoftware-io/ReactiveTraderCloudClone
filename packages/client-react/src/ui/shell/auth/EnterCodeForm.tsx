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
  describeFieldError,
  findFirstFailingField,
  type InputCheck,
} from "@rtc/core-logic";

import { FieldError } from "./FieldError";
import { fieldErrorId } from "./fieldErrorId";
import { PasswordChecklist } from "./PasswordChecklist";

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
  const [revealed, setRevealed] =
    useState<ReadonlySet<AccountField>>(NOTHING_REVEALED);
  const emailInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  const asksEmail = state.email === null;
  const asksPassword = !state.passwordHeld;
  const resetting = state.flow === "reset";

  const emailCheck = checkEmailInput(email);
  const codeCheck = checkCodeInput(code);
  const emailError = describeFieldError(emailCheck, revealed.has("email"));
  const codeError = describeFieldError(codeCheck, revealed.has("code"));

  function submitCode(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setRevealed(EVERY_FIELD_REVEALED);
    // Only the fields on screen: a held address is not the form's to check.
    const codeField: readonly [AccountField, InputCheck] = ["code", codeCheck];
    const failing = findFirstFailingField(
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

  /** A held address is the machine's to name; a typed one is passed on. */
  function resendCode(): void {
    onResend(asksEmail ? email : undefined);
  }

  function revealEmailError(): void {
    setRevealed((shown) => {
      return new Set(shown).add("email");
    });
  }

  function revealCodeError(): void {
    setRevealed((shown) => {
      return new Set(shown).add("code");
    });
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
              aria-invalid={emailError !== null}
              aria-describedby={
                emailError === null ? undefined : fieldErrorId("email")
              }
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
            aria-invalid={codeError !== null}
            aria-describedby={
              codeError === null ? undefined : fieldErrorId("code")
            }
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
          className={styles.link}
          disabled={state.busy}
          onClick={resendCode}
        >
          {ACCOUNT_ACCESS_COPY.resendLink}
        </button>
        <button
          type="button"
          data-testid="login-back"
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

const NOTHING_REVEALED: ReadonlySet<AccountField> = new Set();

const EVERY_FIELD_REVEALED: ReadonlySet<AccountField> = new Set([
  "email",
  "code",
]);

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
