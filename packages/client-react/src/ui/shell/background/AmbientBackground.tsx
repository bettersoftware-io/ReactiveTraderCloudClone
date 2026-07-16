import type { CSSProperties, ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./AmbientBackground.module.css";

/**
 * COSMETIC ONLY — decorative v2 aurora backdrop (two blurred radial layers, a
 * conic sweep, a drifting 48px line grid, a drifting particle-dot field, and
 * a static vignette) painted behind the workspace, always visible at the
 * per-skin `--aurora-opacity` token. It is gated by the animated-background
 * perf preference, which toggles `--amb-play` between "running" and "paused"
 * so the layers drift (default) or hold still. There is NO port behind it
 * beyond that preference: do NOT wire any data into this component, it is
 * intentionally dead chrome. It is aria-hidden and pointer-events: none, so
 * it never participates in interaction or a11y.
 *
 * Power saver is a master override on top of that preference: when it is on,
 * the animated aurora/sweep/dots layers are omitted from the DOM outright
 * (an absent layer costs no compositing, unlike one merely paused) — only
 * the static grid + vignette remain. `data-animated` still reflects the
 * user's own animated-background preference unchanged; it is not rewritten
 * by power saver.
 */
export function AmbientBackground(): ReactElement {
  const { useAnimatedBackground, usePowerSaver } = useViewModel();
  const { enabled } = useAnimatedBackground();
  const { enabled: powerSaver } = usePowerSaver();
  const vars = {
    "--amb-play": enabled && !powerSaver ? "running" : "paused",
  } as CSSProperties;
  return (
    <div
      data-testid="ambient-background"
      aria-hidden="true"
      data-animated={enabled ? "true" : "false"}
      data-power-saver={powerSaver ? "true" : "false"}
      className={styles.wrap}
      style={vars}
    >
      {!powerSaver && (
        <>
          <div data-layer="aurora" className={styles.aurora}>
            <div className={styles.layerA} />
            <div className={styles.layerB} />
          </div>
          <div className={styles.sweep} />
        </>
      )}
      <div className={styles.grid} />
      {!powerSaver && <div className={styles.dots} />}
      <div className={styles.vignette} />
    </div>
  );
}
