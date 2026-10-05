import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useRef,
  useState,
} from "react";

import type { DemoAccount } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { HudLogo } from "../logo/HudLogo";
import { DemoAccountsHint } from "./DemoAccountsHint";
import { HandshakeConsole } from "./wait/HandshakeConsole";
import { ReactorRings } from "./wait/ReactorRings";
import { ReactorWait } from "./wait/ReactorWait";

import styles from "./LoginScreen.module.css";
import waitStyles from "./wait/authWait.module.css";

/**
 * Full-screen sign-in form (prototype-styled to match LockScreen). Renders
 * unconditionally while mounted — the composition root is expected to mount
 * it only for the "unauthenticated" branch of the auth lifecycle. Dumb
 * component: all state arrives through the `useAuth` hook seam; the typed
 * credentials live in local component state only and are never logged.
 */
export function LoginScreen(): ReactElement {
  const { useAuth, useDemoAccounts } = useViewModel();
  const { state, login } = useAuth();
  const demoAccounts = useDemoAccounts();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const submitRef = useRef<HTMLButtonElement>(null);

  function submitLogin(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    login(username, password);
  }

  function changeUsername(event: ChangeEvent<HTMLInputElement>): void {
    setUsername(event.target.value);
  }

  function changePassword(event: ChangeEvent<HTMLInputElement>): void {
    setPassword(event.target.value);
  }

  /** A picked demo account fills both fields and hands focus to AUTHENTICATE,
   * so the next Enter signs in — the pick itself never does. */
  function stageSignIn(account: DemoAccount): void {
    setUsername(account.username);
    setPassword(account.password);
    submitRef.current?.focus();
  }

  const authenticating = state.status === "authenticating";
  const reactorWaiting = authenticating && state.waitVariant === "reactor";

  return (
    <div data-testid="login-screen" className={styles.overlay}>
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
          REACTIVE TRADER OS · SIGN IN
        </div>

        <form className={styles.form} onSubmit={submitLogin}>
          <div
            className={
              authenticating
                ? `${waitStyles.fields} ${waitStyles.recede}`
                : waitStyles.fields
            }
          >
            <label className={styles.field}>
              <span className={styles.label}>Username</span>
              <input
                data-testid="login-username"
                className={styles.input}
                type="text"
                autoComplete="username"
                value={username}
                onChange={changeUsername}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Password</span>
              <input
                data-testid="login-password"
                className={styles.input}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={changePassword}
              />
            </label>
          </div>

          {state.error !== null ? (
            <div data-testid="login-error" className={styles.error}>
              {state.error}
            </div>
          ) : null}

          <button
            ref={submitRef}
            type="submit"
            data-testid="login-submit"
            className={
              authenticating
                ? `${styles.submit} ${waitStyles.busy}`
                : styles.submit
            }
            disabled={authenticating}
          >
            {authenticating ? "AUTHENTICATING" : "AUTHENTICATE ▸"}
          </button>

          {authenticating && state.waitVariant === "handshake" ? (
            <HandshakeConsole />
          ) : null}
          {authenticating && state.waitVariant === "reactor" ? (
            <ReactorWait />
          ) : null}
        </form>

        <DemoAccountsHint
          accounts={demoAccounts}
          busy={authenticating}
          onPick={stageSignIn}
        />
      </div>
    </div>
  );
}
