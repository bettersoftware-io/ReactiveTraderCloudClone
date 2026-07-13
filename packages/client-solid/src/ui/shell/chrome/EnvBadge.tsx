// DECORATIVE — cosmetic HUD chrome, intentionally not wired to any port (spec: decorative-but-dead is allowed and explicit).
import type { JSX } from "solid-js";

import styles from "./HeaderChrome.module.css";

/**
 * The deployment-environment badge (prototype Reactive Trader.dc.html:147). The
 * app has no real environments (Non-goals: no real backend), so the label is a
 * fixed `PROD` — purely decorative chrome, not read from any port or config.
 */
export function EnvBadge(): JSX.Element {
  return (
    <span data-testid="env-badge" class={styles.envBadge}>
      PROD
    </span>
  );
}
