import type { ReactElement } from "react";

import { describeAccountAccessTitle } from "@rtc/core-logic";
import { useViewModel } from "@rtc/react-bindings";

import { HudLogo } from "../logo/HudLogo";
import { useAccountRoutes } from "../routes/useAccountRoutes";
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
 * unconditionally while mounted — the composition root is expected to mount
 * it only for the "unauthenticated" branch of the auth lifecycle. Dumb
 * component: all state arrives through the `useAuth` / `useAccountAccess`
 * hook seams; whatever is typed lives in each form's local state only and is
 * never logged.
 */
export function LoginScreen(): ReactElement {
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
  const navigate = useAccountRoutes(account, registrationAvailable);

  // The four links go through the route hook: each pushes its mode's route
  // before calling the intent, so Back returns to where the user was.
  function openCreateAccount(): void {
    navigate("startRegistration");
  }

  function openForgotPassword(): void {
    navigate("startReset");
  }

  function openCodeEntry(): void {
    navigate("startCodeEntry");
  }

  function openSignIn(): void {
    navigate("returnToSignIn");
  }

  const reactorWaiting =
    auth.state.status === "authenticating" &&
    auth.state.waitVariant === "reactor";

  return (
    <div
      data-testid="login-screen"
      data-phase={state.phase}
      className={styles.overlay}
    >
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.panel}>
        {/* Hex emblem — the shared animated HUD logo, matching LockScreen.
            While the reactor wait treatment is in flight, ReactorRings wraps
            it with the spin-up arcs + pulse instead of a bare HudLogo. */}
        <div className={styles.badge} aria-hidden="true">
          {reactorWaiting ? (
            <ReactorRings>
              <HudLogo />
            </ReactorRings>
          ) : (
            <HudLogo />
          )}
        </div>

        <div data-testid="login-title" className={styles.title}>
          {describeAccountAccessTitle(state)}
        </div>

        {state.phase === "signIn" ? (
          <SignInForm
            auth={auth.state}
            registrationAvailable={registrationAvailable}
            demoAccounts={demoAccounts}
            onLogin={auth.login}
            onCreateAccount={openCreateAccount}
            onForgotPassword={openForgotPassword}
            onEnterCode={openCodeEntry}
          />
        ) : null}
        {state.phase === "register" ? (
          <CreateAccountForm
            state={state}
            onRegister={account.register}
            onHaveCode={openCodeEntry}
            onBack={openSignIn}
          />
        ) : null}
        {state.phase === "code" ? (
          <EnterCodeForm
            state={state}
            onSubmit={account.submitCode}
            onResend={account.resendCode}
            onBack={openSignIn}
          />
        ) : null}
        {state.phase === "requestReset" ? (
          <ResetRequestForm
            state={state}
            onRequest={account.requestReset}
            onBack={openSignIn}
          />
        ) : null}
        {state.phase === "pendingApproval" ||
        state.phase === "passwordUnset" ||
        state.phase === "passwordChanged" ? (
          <AccountNotice
            state={state}
            onRequestReset={account.requestReset}
            onSignIn={openSignIn}
          />
        ) : null}
      </div>
    </div>
  );
}
