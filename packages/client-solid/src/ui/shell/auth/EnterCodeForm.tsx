import { createSignal, type JSX, Show } from "solid-js";

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
import { keepFieldFocus } from "./keepFieldFocus";
import { PasswordChecklist } from "./PasswordChecklist";

import styles from "./LoginScreen.module.css";

/**
 * The code step of either flow. It names the address the code went to when
 * the machine holds one (else asks for it), and asks for a password only when
 * the machine holds none. The address (when asked for) and the code each
 * show their check's error under the field once it has been left; a submit
 * reveals them and sends nothing while one fails, focusing the first that
 * does. It submits exactly the fields it showed. Dumb component: the code
 * and password live in local signals only and are never logged.
 */
export function EnterCodeForm(props: EnterCodeFormProps): JSX.Element {
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [revealed, setRevealed] =
    createSignal<ReadonlySet<AccountField>>(NOTHING_REVEALED);
  let emailInput: HTMLInputElement | undefined;
  let codeInput: HTMLInputElement | undefined;

  function emailError(): string | null {
    return describeFieldError(
      checkEmailInput(email()),
      revealed().has("email"),
    );
  }

  function codeError(): string | null {
    return describeFieldError(checkCodeInput(code()), revealed().has("code"));
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
    setRevealed(EVERY_FIELD_REVEALED);
    // Only the fields on screen: a held address is not the form's to check.
    const codeField: readonly [AccountField, InputCheck] = [
      "code",
      checkCodeInput(code()),
    ];

    const failing = findFirstFailingField(
      asksEmail()
        ? [["email", checkEmailInput(email())], codeField]
        : [codeField],
    );

    if (failing !== null) {
      (failing === "email" ? emailInput : codeInput)?.focus();

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
    setRevealed((shown) => {
      return new Set(shown).add("email");
    });
  }

  function revealCodeError(): void {
    setRevealed((shown) => {
      return new Set(shown).add("code");
    });
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
            aria-invalid={codeError() !== null}
            aria-describedby={
              codeError() === null ? undefined : fieldErrorId("code")
            }
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

const NOTHING_REVEALED: ReadonlySet<AccountField> = new Set();

const EVERY_FIELD_REVEALED: ReadonlySet<AccountField> = new Set([
  "email",
  "code",
]);

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
