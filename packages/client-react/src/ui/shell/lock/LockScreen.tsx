import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { HudLogo } from "../logo/HudLogo";
import { BiometricChannel } from "./BiometricChannel";
import { BiometricDots } from "./BiometricDots";

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

  if (!state.locked) {
    return null;
  }

  const { user } = state;

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

        <button
          type="button"
          data-testid="lock-authenticate"
          className={styles.authenticate}
          onClick={unlock}
        >
          AUTHENTICATE ▸
        </button>

        <BiometricChannel />
      </div>
    </div>
  );
}
