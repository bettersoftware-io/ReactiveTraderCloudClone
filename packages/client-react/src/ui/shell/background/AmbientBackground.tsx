import type { ReactElement } from "react";

import { useViewModel } from "#/ui/viewModel/useViewModel";

import styles from "./AmbientBackground.module.css";

/**
 * COSMETIC ONLY — decorative ambient HUD backdrop (aurora blobs + a slowly
 * drifting grid) painted behind the workspace. It is gated by the
 * animated-background perf preference and renders nothing visible when off
 * (default). There is NO port behind it beyond that preference: do NOT wire any
 * data into this component, it is intentionally dead chrome. It is aria-hidden
 * and pointer-events: none, so it never participates in interaction or a11y.
 */
export function AmbientBackground(): ReactElement {
  const { useAnimatedBackground } = useViewModel();
  const { enabled } = useAnimatedBackground();
  return (
    <div
      data-testid="ambient-background"
      aria-hidden="true"
      data-animated={enabled ? "true" : "false"}
      className={styles.backdrop}
    >
      <div className={styles.aurora} />
      <div className={styles.grid} />
    </div>
  );
}
