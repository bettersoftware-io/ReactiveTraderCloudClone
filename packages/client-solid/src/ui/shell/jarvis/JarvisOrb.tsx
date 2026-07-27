import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import styles from "./JarvisOrb.module.css";

/**
 * Header orb — the always-visible J.A.R.V.I.S affordance, ported from the v5
 * prototype's header core (36px, no button chrome: a glowing sphere under
 * counter-rotating dashed rings, not a flat icon). The two skins get GENUINELY
 * different cores: MK-I Singularity is a smooth sphere inside two thin dashed
 * orbits; MK-II Reactor is a thick segmented coil around a hard inner rim.
 *
 * `data-jarvis-state` selects the idle breath / speaking pulse / pending-
 * confirmation attention-pulse keyframe variant; `data-skin` recolors and
 * reshapes the core (see .module.css + the per-skin SVG sets below).
 */
export function JarvisOrb(): JSX.Element {
  const { useJarvis } = useViewModel();
  const { state, toggle } = useJarvis();

  function jarvisState(): "attention" | "speaking" | "idle" {
    if (state().pendingConfirmation !== null) {
      return "attention";
    }

    return state().phase === "speaking" ? "speaking" : "idle";
  }

  return (
    <button
      type="button"
      data-testid="jarvis-orb"
      data-jarvis-state={jarvisState()}
      data-skin={state().skin}
      data-active={state().open ? "true" : "false"}
      aria-label="J.A.R.V.I.S assistant"
      class={styles.button}
      onClick={toggle}
    >
      <span class={styles.halo} aria-hidden="true" />
      <span class={styles.core} aria-hidden="true" />

      <Show
        when={state().skin === "reactor"}
        fallback={
          <>
            <span class={styles.ringOuter} aria-hidden="true">
              <svg
                viewBox="0 0 36 36"
                class={styles.ringSvg}
                aria-hidden="true"
              >
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="var(--accent-primary)"
                  stroke-width="1"
                  stroke-dasharray="5 8"
                  opacity="0.85"
                />
                <circle cx="18" cy="2.5" r="1.6" fill="var(--accent-2)" />
              </svg>
            </span>
            <span class={styles.ringInner} aria-hidden="true">
              <svg
                viewBox="0 0 36 36"
                class={styles.ringSvg}
                aria-hidden="true"
              >
                <circle
                  cx="18"
                  cy="18"
                  r="11.5"
                  fill="none"
                  stroke="var(--accent-2)"
                  stroke-width="0.8"
                  stroke-dasharray="2 5"
                  opacity="0.7"
                />
              </svg>
            </span>
          </>
        }
      >
        <span class={styles.ringOuter} aria-hidden="true">
          <svg viewBox="0 0 36 36" class={styles.ringSvg} aria-hidden="true">
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke="var(--accent-primary)"
              stroke-width="3"
              stroke-dasharray="7 3"
              opacity="0.6"
            />
          </svg>
        </span>
        <span class={styles.ringInner} aria-hidden="true">
          <svg viewBox="0 0 36 36" class={styles.ringSvg} aria-hidden="true">
            <circle
              cx="18"
              cy="18"
              r="9.5"
              fill="none"
              stroke="var(--accent-primary)"
              stroke-width="0.9"
              opacity="0.9"
            />
          </svg>
        </span>
      </Show>

      <Show when={state().unread > 0}>
        <span data-testid="jarvis-orb-badge" class={styles.badge}>
          {state().unread}
        </span>
      </Show>
    </button>
  );
}
