import type { JSX } from "solid-js";

import styles from "./ReactorWait.module.css";

/**
 * The `reactor` login-wait treatment: an indeterminate bar and a pulsing
 * status line below the submit button. The counter-rotating arcs that spin
 * up the hex emblem itself live in `ReactorRings`, wrapped around the
 * existing badge (see `LoginScreen`/`LockScreen`) rather than here — this
 * component only owns the bar and status line.
 *
 * Solid port of the client-react component; markup and stylesheet are kept
 * identical so the shared @rtc/ui-contract specs and the visual goldens hold
 * for both clients.
 */
export function ReactorWait(): JSX.Element {
  return (
    <div data-testid="auth-wait-reactor" class={styles.wait}>
      <div class={styles.track} aria-hidden="true">
        <div class={styles.bar} />
      </div>

      <div class={styles.status} role="status" aria-live="polite">
        ▸ AWAITING AUTH GRANT
      </div>
    </div>
  );
}
