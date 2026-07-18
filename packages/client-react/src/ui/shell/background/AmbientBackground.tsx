import type { CSSProperties, ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./AmbientBackground.module.css";

/**
 * COSMETIC ONLY — decorative backdrop painted behind the workspace, always
 * visible at the per-skin `--aurora-opacity` token. The `ambientStyle`
 * preference (`useAmbientStyle()`) selects one of two mutually-exclusive
 * animated layer groups, reflected on the root as `data-ambient-style`:
 *   - `"rays"` (`data-layer="rays"`) — the original v2 backdrop: two blurred
 *     radial blobs + a conic sweep.
 *   - `"aurora"` (`data-layer="aurora-curtains"`) — northern-lights curtains:
 *     two soft radial blobs + three drifting comb bands + a static wash, on a
 *     fixed (non-theme-tinted) palette.
 * Both styles share the drifting 48px line grid, the drifting particle-dot
 * field, and the static vignette. It is gated by the animated-background
 * perf preference, which toggles `--amb-play` between "running" and "paused"
 * so the active style's layers drift (default) or hold still. There is NO
 * port behind either style beyond these two preferences: do NOT wire any
 * data into this component, it is intentionally dead chrome. It is
 * aria-hidden and pointer-events: none, so it never participates in
 * interaction or a11y.
 *
 * Power saver is a master override on top of the animated-background
 * preference: when it is on, the active style's animated layers (rays or
 * aurora-curtains) and the dots layer are omitted from the DOM outright
 * (an absent layer costs no compositing, unlike one merely paused) — only
 * the static grid + vignette remain. `data-animated` still reflects the
 * user's own animated-background preference unchanged; it is not rewritten
 * by power saver.
 */
export function AmbientBackground(): ReactElement {
  const { useAnimatedBackground, usePowerSaver, useAmbientStyle } =
    useViewModel();
  const { enabled } = useAnimatedBackground();
  const { enabled: powerSaver } = usePowerSaver();
  const { style } = useAmbientStyle();
  const vars = {
    "--amb-play": enabled && !powerSaver ? "running" : "paused",
  } as CSSProperties;
  return (
    <div
      data-testid="ambient-background"
      aria-hidden="true"
      data-animated={enabled ? "true" : "false"}
      data-power-saver={powerSaver ? "true" : "false"}
      data-ambient-style={style}
      className={styles.wrap}
      style={vars}
    >
      {!powerSaver && style === "rays" && (
        <div data-layer="rays">
          <div className={styles.aurora}>
            <div className={styles.layerA} />
            <div className={styles.layerB} />
          </div>
          <div className={styles.sweep} />
        </div>
      )}
      {!powerSaver && style === "aurora" && (
        <div data-layer="aurora-curtains">
          <div className={styles.auroraWrap}>
            <div className={styles.auroraBlobA} />
            <div className={styles.auroraBlobB} />
          </div>
          <div className={styles.auroraCurtainA} />
          <div className={styles.auroraCurtainB} />
          <div className={styles.auroraCurtainC} />
          <div className={styles.auroraWash} />
        </div>
      )}
      <div className={styles.grid} />
      {!powerSaver && <div className={styles.dots} />}
      <div className={styles.vignette} />
    </div>
  );
}
