// DECORATIVE — cosmetic HUD readout, intentionally not wired to any port (spec: decorative-but-dead is allowed and explicit).
import type { JSX } from "solid-js";

import styles from "./LockScreen.module.css";

/**
 * The `BIOMETRIC · ENCRYPTED CHANNEL` line below the AUTHENTICATE button
 * (prototype LockScreen.tsx:66-84). Purely cosmetic — there is no biometric
 * port or live signal behind it. Its sibling status dots live in
 * BiometricDots.tsx (they render above the button, per the prototype order).
 */
export function BiometricChannel(): JSX.Element {
  return (
    <div class={styles.channel} data-testid="lock-biometric">
      BIOMETRIC · ENCRYPTED CHANNEL
    </div>
  );
}
