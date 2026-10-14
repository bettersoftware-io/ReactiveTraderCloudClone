import {
  type Accessor,
  createMemo,
  type JSX,
  Match,
  Show,
  Switch,
} from "solid-js";

import type { AccountAccessState } from "@rtc/core-api";
import { describeAccountAccessTitle } from "@rtc/core-logic";
import { useViewModel } from "@rtc/solid-bindings";

import { HudLogo } from "../logo/HudLogo";
import { AccountNotice } from "./AccountNotice";
import { CreateAccountForm } from "./CreateAccountForm";
import { EnterCodeForm } from "./EnterCodeForm";
import { ResetRequestForm } from "./ResetRequestForm";
import { SignInForm } from "./SignInForm";
import { ReactorRings } from "./wait/ReactorRings";

import styles from "./LoginScreen.module.css";

/**
 * Full-screen sign-in shell (prototype-styled to match LockScreen): the
 * badge, the title, and one form by account-access phase — sign in, create
 * an account, enter a code, request a reset, or a notice. Renders
 * unconditionally while mounted — AuthGate mounts it only for the
 * unauthenticated branch of the auth lifecycle. Dumb component: all state
 * arrives through the `useAuth` / `useAccountAccess` hook seams; whatever is
 * typed lives in each form's local signals only and is never logged.
 */
export function LoginScreen(): JSX.Element {
  const {
    useAuth,
    useDemoAccounts,
    useRegistrationAvailable,
    useAccountAccess,
  } = useViewModel();
  const auth = useAuth();
  const account = useAccountAccess();
  const demoAccounts = useDemoAccounts();
  const registrationAvailable = useRegistrationAvailable();
  const { state } = account;

  const reactorWaiting = createMemo((): boolean => {
    return (
      auth.state().status === "authenticating" &&
      auth.state().waitVariant === "reactor"
    );
  });

  // One memo per narrowed phase: a form keeps its typed signals across state
  // changes inside its phase (the non-keyed <Show> never remounts it) and
  // receives its phase's own state type.
  const registerState = createMemo((): RegisterState | undefined => {
    const current = state();

    return current.phase === "register" ? current : undefined;
  });

  const codeState = createMemo((): CodeState | undefined => {
    const current = state();

    return current.phase === "code" ? current : undefined;
  });

  const requestResetState = createMemo((): RequestResetState | undefined => {
    const current = state();

    return current.phase === "requestReset" ? current : undefined;
  });

  const noticeState = createMemo((): NoticeState | undefined => {
    const current = state();

    return current.phase === "pendingApproval" ||
      current.phase === "passwordUnset" ||
      current.phase === "passwordChanged"
      ? current
      : undefined;
  });

  return (
    <div
      data-testid="login-screen"
      data-phase={state().phase}
      class={styles.overlay}
    >
      <div class={styles.grid} aria-hidden="true" />
      <div class={styles.panel}>
        {/* Hex emblem — the shared animated HUD logo, matching LockScreen.
            While the reactor wait treatment is in flight, ReactorRings wraps
            it with the spin-up arcs + pulse instead of a bare HudLogo. */}
        <div class={styles.badge} aria-hidden="true">
          <Show when={reactorWaiting()} fallback={<HudLogo />}>
            <ReactorRings>
              <HudLogo />
            </ReactorRings>
          </Show>
        </div>

        <div data-testid="login-title" class={styles.title}>
          {describeAccountAccessTitle(state())}
        </div>

        <Switch>
          <Match when={state().phase === "signIn"}>
            <SignInForm
              auth={auth.state()}
              registrationAvailable={registrationAvailable}
              demoAccounts={demoAccounts}
              onLogin={auth.login}
              onCreateAccount={account.startRegistration}
              onForgotPassword={account.startReset}
              onEnterCode={account.startCodeEntry}
            />
          </Match>
          <Match when={registerState()}>
            {(current: Accessor<RegisterState>) => {
              return (
                <CreateAccountForm
                  state={current()}
                  onRegister={account.register}
                  onHaveCode={account.startCodeEntry}
                  onBack={account.returnToSignIn}
                />
              );
            }}
          </Match>
          <Match when={codeState()}>
            {(current: Accessor<CodeState>) => {
              return (
                <EnterCodeForm
                  state={current()}
                  onSubmit={account.submitCode}
                  onResend={account.resendCode}
                  onBack={account.returnToSignIn}
                />
              );
            }}
          </Match>
          <Match when={requestResetState()}>
            {(current: Accessor<RequestResetState>) => {
              return (
                <ResetRequestForm
                  state={current()}
                  onRequest={account.requestReset}
                  onBack={account.returnToSignIn}
                />
              );
            }}
          </Match>
          <Match when={noticeState()}>
            {(current: Accessor<NoticeState>) => {
              return (
                <AccountNotice
                  state={current()}
                  onRequestReset={account.requestReset}
                  onSignIn={account.returnToSignIn}
                />
              );
            }}
          </Match>
        </Switch>
      </div>
    </div>
  );
}

interface RegisterPhaseTag {
  readonly phase: "register";
}

interface CodePhaseTag {
  readonly phase: "code";
}

interface RequestResetPhaseTag {
  readonly phase: "requestReset";
}

interface NoticePhaseTag {
  readonly phase: "pendingApproval" | "passwordUnset" | "passwordChanged";
}

type RegisterState = Extract<AccountAccessState, RegisterPhaseTag>;
type CodeState = Extract<AccountAccessState, CodePhaseTag>;
type RequestResetState = Extract<AccountAccessState, RequestResetPhaseTag>;
type NoticeState = Extract<AccountAccessState, NoticePhaseTag>;
