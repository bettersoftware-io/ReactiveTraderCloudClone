import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./JarvisOrb.module.css";

/**
 * Header orb — the always-visible J.A.R.V.I.S affordance. Template:
 * PowerSaverToggle's 32px icon-button idiom + HeaderChrome's `.badge` unread
 * pill. `data-jarvis-state` selects the idle breath / speaking pulse /
 * pending-confirmation attention-pulse keyframe variant; `data-skin`
 * recolors the core/glow gradients per JarvisSkin (see .module.css).
 */
export function JarvisOrb(): ReactElement {
  const { useJarvis } = useViewModel();
  const { state, toggle } = useJarvis();
  const jarvisState =
    state.pendingConfirmation !== null
      ? "attention"
      : state.phase === "speaking"
        ? "speaking"
        : "idle";

  return (
    <button
      type="button"
      data-testid="jarvis-orb"
      data-jarvis-state={jarvisState}
      data-skin={state.skin}
      data-active={state.open ? "true" : "false"}
      aria-label="J.A.R.V.I.S assistant"
      className={styles.button}
      onClick={toggle}
    >
      <span className={styles.core} aria-hidden="true" />
      <span className={styles.glow} aria-hidden="true" />
      {state.unread > 0 && (
        <span data-testid="jarvis-orb-badge" className={styles.badge}>
          {state.unread}
        </span>
      )}
    </button>
  );
}
