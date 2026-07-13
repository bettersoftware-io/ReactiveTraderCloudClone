// DECORATIVE — cosmetic HUD readout, intentionally not wired to any port (spec: decorative-but-dead is allowed and explicit).
import type { JSX } from "solid-js";

import styles from "./LockScreen.module.css";

/**
 * The 4-of-6 biometric status dots on the lock overlay; they render BETWEEN
 * the role line and the AUTHENTICATE button (prototype LockScreen.tsx:66-84).
 * Purely cosmetic — there is no biometric port or live signal behind them.
 * The `BIOMETRIC · ENCRYPTED CHANNEL` line below the button lives in
 * BiometricChannel.tsx.
 */
export function BiometricDots(): JSX.Element {
  return (
    <div class={styles.dots} data-testid="lock-dots" aria-hidden="true">
      <div class={styles.dotOn} />
      <div class={styles.dotOn} />
      <div class={styles.dotOn} />
      <div class={styles.dotOn} />
      <div class={styles.dotOff} />
      <div class={styles.dotOff} />
    </div>
  );
}
