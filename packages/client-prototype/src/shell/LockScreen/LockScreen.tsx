import type { ReactElement } from "react";

import { user } from "#/mock/shellData";
import styles from "#/shell/LockScreen/LockScreen.module.css";

// PROTO randomizes per session; constant for test stability
const SESSION_ID = "RT-7F3A2";

export interface LockScreenProps {
  onAuthenticate(): void;
}

export function LockScreen(props: LockScreenProps): ReactElement {
  const { onAuthenticate } = props;

  return (
    <div className={styles.overlay}>
      <div className={styles.grid} aria-hidden={true} />
      <div className={styles.card}>
        <svg viewBox="0 0 48 48" className={styles.logo} aria-hidden={true}>
          <g
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.3"
            strokeLinejoin="round"
          >
            <polygon points="24,3 40.6,13.5 40.6,34.5 24,45 7.4,34.5 7.4,13.5" />
            <polygon
              points="24,8 36.3,15.75 36.3,31.25 24,39 11.7,31.25 11.7,15.75"
              stroke="var(--accent2)"
              opacity="0.6"
            />
          </g>
          <circle
            cx="24"
            cy="24"
            r="11"
            fill="none"
            stroke="var(--accent2)"
            strokeWidth="1"
            strokeDasharray="3 5"
            opacity="0.85"
            className={styles.spinRing}
          />
          <circle cx="24" cy="24" r="3.4" fill="var(--accent)" />
        </svg>

        <h1 className={styles.heading}>SESSION LOCKED</h1>
        <p className={styles.sessionId}>REACTIVE TRADER OS · {SESSION_ID}</p>

        <div className={styles.hexWrap}>
          <svg viewBox="0 0 28 28" className={styles.hexSvg} aria-hidden={true}>
            <polygon
              points="14,1.5 25,7.75 25,20.25 14,26.5 3,20.25 3,7.75"
              fill="var(--chip)"
              stroke="var(--accent)"
              strokeWidth="1.3"
            />
          </svg>
          <span className={styles.initials}>{user.initials}</span>
        </div>

        <div className={styles.userName}>{user.name}</div>
        <div className={styles.userRole}>{user.role}</div>

        <div className={styles.dots} aria-hidden={true}>
          <span className={styles.dotFilled} />
          <span className={styles.dotFilled} />
          <span className={styles.dotFilled} />
          <span className={styles.dotFilled} />
          <span className={styles.dotOutline} />
          <span className={styles.dotOutline} />
        </div>

        <button
          type="button"
          className={styles.authButton}
          aria-label="Authenticate"
          onClick={onAuthenticate}
        >
          AUTHENTICATE &#9658;
        </button>

        <p className={styles.footer}>BIOMETRIC · ENCRYPTED CHANNEL</p>
      </div>
    </div>
  );
}
