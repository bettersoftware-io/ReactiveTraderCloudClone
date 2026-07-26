import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import styles from "./JarvisOrb.module.css";

/**
 * Header orb — the always-visible J.A.R.V.I.S affordance. Template:
 * PowerSaverToggle's 32px icon-button idiom + HeaderChrome's `.badge` unread
 * pill. `data-jarvis-state` selects the idle breath / speaking pulse /
 * pending-confirmation attention-pulse keyframe variant; `data-skin`
 * recolors the core/glow gradients per JarvisSkin (see .module.css).
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
      <span class={styles.core} aria-hidden="true" />
      <span class={styles.glow} aria-hidden="true" />
      <Show when={state().unread > 0}>
        <span data-testid="jarvis-orb-badge" class={styles.badge}>
          {state().unread}
        </span>
      </Show>
    </button>
  );
}
