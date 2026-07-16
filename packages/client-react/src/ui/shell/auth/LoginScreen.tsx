import type { ChangeEvent, FormEvent, ReactElement } from "react";
import { useState } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { HudLogo } from "../logo/HudLogo";

import styles from "./LoginScreen.module.css";

/**
 * Full-screen sign-in form (prototype-styled to match LockScreen). Renders
 * unconditionally while mounted — the composition root is expected to mount
 * it only for the "unauthenticated" branch of the auth lifecycle. Dumb
 * component: all state arrives through the `useAuth` hook seam; the typed
 * credentials live in local component state only and are never logged.
 */
export function LoginScreen(): ReactElement {
  const { useAuth } = useViewModel();
  const { state, login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function handleUsernameChange(event: ChangeEvent<HTMLInputElement>): void {
    setUsername(event.target.value);
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>): void {
    setPassword(event.target.value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    login(username, password);
  }

  const authenticating = state.status === "authenticating";

  return (
    <div data-testid="login-screen" className={styles.overlay}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.panel}>
        {/* Hex emblem — the shared animated HUD logo, matching LockScreen. */}
        <div className={styles.badge} aria-hidden="true">
          <HudLogo />
        </div>

        <div data-testid="login-title" className={styles.title}>
          REACTIVE TRADER OS · SIGN IN
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>Username</span>
            <input
              data-testid="login-username"
              className={styles.input}
              type="text"
              autoComplete="username"
              value={username}
              onChange={handleUsernameChange}
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
              onChange={handlePasswordChange}
            />
          </label>

          {state.error !== null ? (
            <div data-testid="login-error" className={styles.error}>
              {state.error}
            </div>
          ) : null}

          <button
            type="submit"
            data-testid="login-submit"
            className={styles.submit}
            disabled={authenticating}
          >
            AUTHENTICATE ▸
          </button>
        </form>
      </div>
    </div>
  );
}
