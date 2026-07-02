import type { CSSProperties, ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./AmbientBackground.module.css";

/**
 * COSMETIC ONLY — decorative v2 aurora backdrop (two blurred radial layers, a
 * conic sweep, and a drifting dot grid) painted behind the workspace, always
 * visible at the per-skin `--aurora-opacity` token. It is gated by the
 * animated-background perf preference, which toggles `--amb-play` between
 * "running" and "paused" so the layers hold still (default) or drift. There is
 * NO port behind it beyond that preference: do NOT wire any data into this
 * component, it is intentionally dead chrome. It is aria-hidden and
 * pointer-events: none, so it never participates in interaction or a11y.
 */
export function AmbientBackground(): ReactElement {
  const { useAnimatedBackground } = useViewModel();
  const { enabled } = useAnimatedBackground();
  const vars = {
    "--amb-play": enabled ? "running" : "paused",
  } as CSSProperties;
  return (
    <div
      data-testid="ambient-background"
      aria-hidden="true"
      data-animated={enabled ? "true" : "false"}
      className={styles.wrap}
      style={vars}
    >
      <div className={styles.layerA} />
      <div className={styles.layerB} />
      <div className={styles.sweep} />
      <div className={styles.grid} />
    </div>
  );
}
