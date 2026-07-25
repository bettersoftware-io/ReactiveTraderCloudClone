import type { ReactElement } from "react";

import styles from "./HandshakeConsole.module.css";

/**
 * The `handshake` login-wait treatment: a monospace telemetry readout that
 * takes over while an auth request is in flight.
 *
 * Deliberately stateless and timer-free. The component's own lifecycle is the
 * truth signal — it mounts exactly when the request is dispatched and unmounts
 * exactly when the outcome lands — so line 1 and line 3 are accurate the
 * moment they render, and line 2's reveal is pure CSS. Nothing here claims a
 * server-side fact we cannot observe.
 */
export function HandshakeConsole(): ReactElement {
  return (
    <div
      data-testid="auth-wait-handshake"
      className={styles.console}
      role="status"
      aria-live="polite"
    >
      <div className={`${styles.line} ${styles.done}`}>
        ▸ SECURE CHANNEL OPEN
      </div>
      <div className={`${styles.line} ${styles.sealed}`}>
        ▸ CREDENTIALS SEALED
      </div>
      <div className={`${styles.line} ${styles.active}`}>
        ▸ AWAITING AUTH GRANT
        <span className={styles.caret} aria-hidden="true">
          ▌
        </span>
      </div>
    </div>
  );
}
