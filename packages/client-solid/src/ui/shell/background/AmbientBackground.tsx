import type { JSX } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import styles from "./AmbientBackground.module.css";

/**
 * COSMETIC ONLY — decorative v2 aurora backdrop (two blurred radial layers, a
 * conic sweep, a drifting 48px line grid, a drifting particle-dot field, and
 * a static vignette) painted behind the workspace, always visible at the
 * per-skin `--aurora-opacity` token. It is gated by the animated-background
 * perf preference, which toggles `--amb-play` between "running" and "paused"
 * so the layers hold still (default) or drift. There is NO port behind it
 * beyond that preference: do NOT wire any data into this component, it is
 * intentionally dead chrome. It is aria-hidden and pointer-events: none, so
 * it never participates in interaction or a11y.
 */
export function AmbientBackground(): JSX.Element {
  const { useAnimatedBackground } = useViewModel();
  const { enabled } = useAnimatedBackground();
  const vars: JSX.CSSProperties = {
    "--amb-play": enabled() ? "running" : "paused",
  };
  return (
    <div
      data-testid="ambient-background"
      aria-hidden="true"
      data-animated={enabled() ? "true" : "false"}
      class={styles.wrap}
      style={vars}
    >
      <div class={styles.aurora}>
        <div class={styles.layerA} />
        <div class={styles.layerB} />
      </div>
      <div class={styles.sweep} />
      <div class={styles.grid} />
      <div class={styles.dots} />
      <div class={styles.vignette} />
    </div>
  );
}
