import type { ChangeEvent, FormEvent, ReactElement } from "react";
import { useState } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { HudLogo } from "../logo/HudLogo";
import { BiometricChannel } from "./BiometricChannel";
import { BiometricDots } from "./BiometricDots";

import styles from "./LockScreen.module.css";

/**
 * Full-screen session-lock overlay (prototype Reactive Trader.dc.html:76-91).
 * Renders nothing unless the session is locked; while locked it shows the
 * operator identity and a password-gated AUTHENTICATE control that
 * re-authenticates (unlock) against the real credentials seam. Dumb
 * component: all state arrives through the `useAuth` hook seam; the typed
 * password lives in local component state only and is never logged.
 */
export function LockScreen(): ReactElement | null {
  const { useAuth } = useViewModel();
  const { state, unlock } = useAuth();

  const [password, setPassword] = useState("");

  if (!state.locked || !state.user) {
    return null;
  }

  const { user } = state;

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>): void {
    setPassword(event.target.value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    unlock(password);
  }

  return (
    <div data-testid="lock-screen" className={styles.overlay}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.panel}>
        {/* Hex emblem (prototype line 80) — the shared animated HUD logo. */}
        <div className={styles.badge} aria-hidden="true">
          <HudLogo />
        </div>

        <div data-testid="lock-title" className={styles.title}>
          SESSION LOCKED
        </div>
        <div className={styles.subtitle}>REACTIVE TRADER OS · {user.id}</div>

        {/* Operator avatar — hex chip with initials (prototype line 83). */}
        <div className={styles.avatar}>
          <svg
            viewBox="0 0 28 28"
            className={styles.avatarHex}
            aria-hidden="true"
          >
            <polygon
              points="14,1.5 25,7.75 25,20.25 14,26.5 3,20.25 3,7.75"
              className={styles.avatarChip}
              stroke="var(--accent-primary)"
              strokeWidth="1.3"
            />
          </svg>
          <span className={styles.initials}>{user.initials}</span>
        </div>

        <div data-testid="lock-user-name" className={styles.name}>
          {user.name}
        </div>
        <div className={styles.role}>{user.role}</div>

        {/* Prototype order: the biometric dots sit between the role line and
            the AUTHENTICATE button; the channel line stays below the button. */}
        <BiometricDots />

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <input
              data-testid="lock-password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={handlePasswordChange}
            />
          </label>

          {state.error !== null ? (
            <div data-testid="lock-error" className={styles.error}>
              {state.error}
            </div>
          ) : null}

          <button
            type="submit"
            data-testid="lock-authenticate"
            className={styles.authenticate}
          >
            AUTHENTICATE ▸
          </button>
        </form>

        <BiometricChannel />
      </div>
    </div>
  );
}
