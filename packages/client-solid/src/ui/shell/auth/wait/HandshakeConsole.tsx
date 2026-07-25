import type { JSX } from "solid-js";

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
 *
 * Solid port of the client-react component; markup and stylesheet are kept
 * identical so the shared @rtc/ui-contract specs and the visual goldens hold
 * for both clients.
 */
export function HandshakeConsole(): JSX.Element {
  return (
    <div
      data-testid="auth-wait-handshake"
      class={styles.console}
      role="status"
      aria-live="polite"
    >
      <div class={`${styles.line} ${styles.done}`}>▸ SECURE CHANNEL OPEN</div>
      <div class={`${styles.line} ${styles.sealed}`}>▸ CREDENTIALS SEALED</div>
      <div class={`${styles.line} ${styles.active}`}>
        ▸ AWAITING AUTH GRANT
        <span class={styles.caret} aria-hidden="true">
          ▌
        </span>
      </div>
    </div>
  );
}
