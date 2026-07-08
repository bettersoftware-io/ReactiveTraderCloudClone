// DECORATIVE — cosmetic HUD readout, intentionally not wired to any port (spec: decorative-but-dead is allowed and explicit).
import type { ReactElement } from "react";

import styles from "./LockScreen.module.css";

/**
 * The biometric readout on the lock overlay, split into its two prototype
 * positions: the 4-of-6 status dots render BETWEEN the role line and the
 * AUTHENTICATE button, while the `BIOMETRIC · ENCRYPTED CHANNEL` line stays
 * below the button (prototype LockScreen.tsx:66-84). Purely cosmetic — there
 * is no biometric port or live signal behind either piece.
 */
export function BiometricDots(): ReactElement {
  return (
    <div className={styles.dots} data-testid="lock-dots" aria-hidden="true">
      <div className={styles.dotOn} />
      <div className={styles.dotOn} />
      <div className={styles.dotOn} />
      <div className={styles.dotOn} />
      <div className={styles.dotOff} />
      <div className={styles.dotOff} />
    </div>
  );
}

export function BiometricChannel(): ReactElement {
  return (
    <div className={styles.channel} data-testid="lock-biometric">
      BIOMETRIC · ENCRYPTED CHANNEL
    </div>
  );
}
