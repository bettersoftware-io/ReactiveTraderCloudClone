import type { JSX } from "solid-js";
import { createMemo, Match, Show, Switch } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

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
 * preference: whenever the level is Calm or Freeze (`isCalm`, level !== "off"
 * — Freeze ⊇ Calm), the active style's animated layers (rays or
 * aurora-curtains) and the dots layer are omitted from the DOM outright (an
 * absent layer costs no compositing, unlike one merely paused) — only the
 * static grid + vignette remain. `data-animated` still reflects the user's own
 * animated-background preference unchanged; it is not rewritten by power saver.
 */
export function AmbientBackground(): JSX.Element {
  const { useAnimatedBackground, usePowerSaver, useAmbientStyle } =
    useViewModel();
  const { enabled } = useAnimatedBackground();
  const { isCalm } = usePowerSaver();
  const { style } = useAmbientStyle();

  // --amb-play is the SOLE driver of animation-play-state on every layer
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
      data-ambient-style={style()}
      class={styles.wrap}
      style={vars()}
    >
      <Show when={!isCalm()}>
        <Switch>
          <Match when={style() === "rays"}>
            <div data-layer="rays">
              <div class={styles.aurora}>
                <div class={styles.layerA} />
                <div class={styles.layerB} />
              </div>
              <div class={styles.sweep} />
            </div>
          </Match>
          <Match when={style() === "aurora"}>
            <div data-layer="aurora-curtains">
              <div class={styles.auroraWrap}>
                <div class={styles.auroraBlobA} />
                <div class={styles.auroraBlobB} />
              </div>
              <div class={styles.auroraCurtainA} />
              <div class={styles.auroraCurtainB} />
              <div class={styles.auroraCurtainC} />
              <div class={styles.auroraWash} />
            </div>
          </Match>
        </Switch>
      </Show>
      <div class={styles.grid} />
      <Show when={!isCalm()}>
        <div class={styles.dots} />
      </Show>
      <div class={styles.vignette} />
    </div>
  );
}
