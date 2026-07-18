import type { JSX } from "solid-js";
import { createMemo, Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

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
 * Power saver is a master override on top of that preference: whenever the
 * level is Calm or Freeze (`isCalm`, level !== "off" — Freeze ⊇ Calm), the
 * animated aurora/sweep/dots layers are omitted from the DOM outright (an
 * absent layer costs no compositing, unlike one merely paused) — only the
 * static grid + vignette remain. `data-animated` still reflects the user's
 * own animated-background preference unchanged; it is not rewritten by power
 * saver.
 */
export function AmbientBackground(): JSX.Element {
  const { useAnimatedBackground, usePowerSaver } = useViewModel();
  const { enabled } = useAnimatedBackground();
  const { isCalm } = usePowerSaver();

  // --amb-play is the SOLE driver of animation-play-state on all five layers
  // (the CSS has no data-animated selector), so it must stay reactive: a
  // plain component-body const would read enabled()/isCalm() exactly
  // once at mount (Solid components run once — the react file's per-render
  // const only works because React re-executes the body), freezing the
  // preference for the whole session. createMemo keeps the read tracked;
  // `style={vars()}` re-applies on change.
  const vars = createMemo((): JSX.CSSProperties => {
    return { "--amb-play": enabled() && !isCalm() ? "running" : "paused" };
  });

  return (
    <div
      data-testid="ambient-background"
      aria-hidden="true"
      data-animated={enabled() ? "true" : "false"}
      data-power-saver={isCalm() ? "on" : "off"}
      class={styles.wrap}
      style={vars()}
    >
      <Show when={!isCalm()}>
        <div data-layer="aurora" class={styles.aurora}>
          <div class={styles.layerA} />
          <div class={styles.layerB} />
        </div>
        <div class={styles.sweep} />
      </Show>
      <div class={styles.grid} />
      <Show when={!isCalm()}>
        <div class={styles.dots} />
      </Show>
      <div class={styles.vignette} />
    </div>
  );
}
