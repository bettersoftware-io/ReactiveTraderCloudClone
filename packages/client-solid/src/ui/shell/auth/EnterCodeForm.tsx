import { createSignal, type JSX, Show } from "solid-js";

import type { AccountAccessState, CodeInput } from "@rtc/core-api";
import {
  ACCOUNT_ACCESS_COPY,
  type AccountField,
  checkCodeInput,
  checkEmailInput,
  checkPasswordInput,
  type InputCheck,
} from "@rtc/core-logic";

import { createFieldReveal } from "./createFieldReveal";
import { FieldError } from "./FieldError";
import { fieldAriaProps } from "./fieldErrorId";
import { keepFieldFocus } from "./keepFieldFocus";
import { PasswordChecklist } from "./PasswordChecklist";

import styles from "./LoginScreen.module.css";

/**
 * The code step of either flow. It names the address the code went to when
 * the machine holds one (else asks for it), and asks for a password only when
 * the machine holds none. Each field on screen (the address and the
 * password only when asked for) shows its check's error under it once it
 * has been left; a submit reveals them and sends nothing while one fails,
 * focusing the first that does. It submits exactly the fields it showed. Dumb component: the code
 * and password live in local signals only and are never logged.
 */
export function EnterCodeForm(props: EnterCodeFormProps): JSX.Element {
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [password, setPassword] = createSignal("");
  const fields = createFieldReveal();
  let emailInput: HTMLInputElement | undefined;
  let codeInput: HTMLInputElement | undefined;
  let passwordInput: HTMLInputElement | undefined;

  function emailError(): string | null {
    return fields.describeError("email", checkEmailInput(email()));
  }

  function codeError(): string | null {
    return fields.describeError("code", checkCodeInput(code()));
  }

  function passwordError(): string | null {
    return fields.describeError("password", checkPasswordInput(password()));
  }

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
    // Only the fields on screen: a held address or password is not the
    // form's to check.
    const checks: (readonly [AccountField, InputCheck])[] = [
      ...(asksEmail() ? [["email", checkEmailInput(email())] as const] : []),
      ["code", checkCodeInput(code())],
      ...(asksPassword()
        ? [["password", checkPasswordInput(password())] as const]
        : []),
    ];
    const failing = fields.revealAll(checks);

    if (failing !== null) {
      focusField(failing);

      return;
    }

    props.onSubmit({
      ...(asksEmail() ? { email: email() } : {}),
      code: code(),
      ...(asksPassword() ? { password: password() } : {}),
    });
  }

  /** A held address is the machine's to name. A typed one is gated like a
   * submit, on the address alone: one that fails shows its error under the
   * field, takes the focus and sends nothing; one that passes is passed on. */
  function resendCode(): void {
    if (!asksEmail()) {
      props.onResend(undefined);

      return;
    }

    if (!checkEmailInput(email()).ok) {
      revealEmailError();
      emailInput?.focus();

      return;
    }

    props.onResend(email());
  }

  function revealEmailError(): void {
    fields.reveal("email");
  }

  function focusField(field: AccountField): void {
    const inputs: Partial<Record<AccountField, HTMLInputElement | undefined>> =
      {
        email: emailInput,
        code: codeInput,
        password: passwordInput,
      };

    inputs[field]?.focus();
  }

  function revealCodeError(): void {
    fields.reveal("code");
  }

  function revealPasswordError(): void {
    fields.reveal("password");
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
            <>
              <label class={styles.field}>
                <span class={styles.label}>
                  {ACCOUNT_ACCESS_COPY.emailLabel}
                </span>
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
            </>
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
            ref={codeInput}
            data-testid="login-code"
            class={styles.input}
            type="text"
            inputMode="numeric"
            autocomplete="one-time-code"
            {...fieldAriaProps("code", codeError())}
            value={code()}
            onInput={changeCode}
            onBlur={revealCodeError}
          />
        </label>
        <FieldError field="code" error={codeError()} />

        <Show when={asksPassword()}>
          <label class={styles.field}>
            <span class={styles.label}>
              {resetting()
                ? ACCOUNT_ACCESS_COPY.newPasswordLabel
                : ACCOUNT_ACCESS_COPY.passwordLabel}
            </span>
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
          onMouseDown={keepFieldFocus}
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
          onMouseDown={keepFieldFocus}
          class={styles.link}
          disabled={props.state.busy}
          onClick={resendCode}
        >
          {ACCOUNT_ACCESS_COPY.resendLink}
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
