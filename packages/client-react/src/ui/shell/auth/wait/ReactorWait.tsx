import type { ReactElement } from "react";

import styles from "./ReactorWait.module.css";

/**
 * The `reactor` login-wait treatment: an indeterminate bar and a pulsing
 * status line below the submit button. The counter-rotating arcs that spin
 * up the hex emblem itself live in `ReactorRings`, wrapped around the
 * existing badge (see `LoginScreen`/`LockScreen`) rather than here — this
 * component only owns the bar and status line.
 */
export function ReactorWait(): ReactElement {
  return (
    <div data-testid="auth-wait-reactor" className={styles.wait}>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.bar} />
      </div>

      <div className={styles.status} role="status" aria-live="polite">
        ▸ AWAITING AUTH GRANT
      </div>
    </div>
  );
}
