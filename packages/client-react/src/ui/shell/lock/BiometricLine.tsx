// DECORATIVE — cosmetic HUD readout, intentionally not wired to any port (spec: decorative-but-dead is allowed and explicit).
import type { ReactElement } from "react";

import styles from "./LockScreen.module.css";

/**
 * The biometric channel readout on the lock overlay: a row of status dots plus
 * the `BIOMETRIC · ENCRYPTED CHANNEL` line. Purely cosmetic — there is no
 * biometric port or live signal behind it (prototype lines 86, 88).
 */
export function BiometricLine(): ReactElement {
  return (
    <div className={styles.biometric} data-testid="lock-biometric">
      <div className={styles.dots} aria-hidden="true">
        <div className={styles.dotOn} />
        <div className={styles.dotOn} />
        <div className={styles.dotOn} />
        <div className={styles.dotOn} />
        <div className={styles.dotOff} />
        <div className={styles.dotOff} />
      </div>
      <div className={styles.channel}>BIOMETRIC · ENCRYPTED CHANNEL</div>
    </div>
  );
}
