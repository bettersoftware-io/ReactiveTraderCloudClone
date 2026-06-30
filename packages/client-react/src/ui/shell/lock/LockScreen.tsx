import type { ReactElement } from "react";

import { useViewModel } from "#/ui/viewModel/useViewModel";

import { BiometricLine } from "./BiometricLine";

import styles from "./LockScreen.module.css";

/**
 * Full-screen session-lock overlay (prototype Reactive Trader.dc.html:76-91).
 * Renders nothing unless the session is locked; while locked it shows the
 * operator identity and an AUTHENTICATE control that re-authenticates (unlock).
 * Dumb component: all state arrives through the `useSession` hook seam.
 */
export function LockScreen(): ReactElement | null {
  const { useSession } = useViewModel();
  const { state, unlock } = useSession();

  if (!state.locked) return null;

  const { user } = state;

  return (
    <div data-testid="lock-screen" className={styles.overlay}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.panel}>
        {/* Hex emblem (prototype line 80). */}
        <svg
          viewBox="0 0 48 48"
          className={styles.badge}
          aria-hidden="true"
          role="presentation"
        >
          <g
            fill="none"
            stroke="var(--accent-primary)"
            strokeWidth="1.3"
            strokeLinejoin="round"
          >
            <polygon points="24,3 40.6,13.5 40.6,34.5 24,45 7.4,34.5 7.4,13.5" />
            <polygon
              points="24,8 36.3,15.75 36.3,31.25 24,39 11.7,31.25 11.7,15.75"
              stroke="var(--accent-2)"
              opacity="0.6"
            />
          </g>
          <circle
            cx="24"
            cy="24"
            r="11"
            fill="none"
            stroke="var(--accent-2)"
            strokeWidth="1"
            strokeDasharray="3 5"
            opacity="0.85"
            className={styles.spin}
          />
          <circle cx="24" cy="24" r="3.4" fill="var(--accent-primary)" />
        </svg>

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
              fill="var(--chip)"
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

        <button
          type="button"
          data-testid="lock-authenticate"
          className={styles.authenticate}
          onClick={unlock}
        >
          AUTHENTICATE ▸
        </button>

        <BiometricLine />
      </div>
    </div>
  );
}
