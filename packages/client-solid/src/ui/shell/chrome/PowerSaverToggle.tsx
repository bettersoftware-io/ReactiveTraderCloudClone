import type { JSX } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import styles from "./PowerSaverToggle.module.css";

/**
 * Header quick toggle for the power-saver master override — one click to
 * trade the ambient wow-effects for headroom on slower hardware. Mirrors the
 * Preferences-modal row (same preference); `aria-pressed` carries the state.
 */
export function PowerSaverToggle(): JSX.Element {
  const { usePowerSaver } = useViewModel();
  const { enabled, toggle } = usePowerSaver();
  return (
    <button
      type="button"
      data-testid="power-saver-toggle"
      aria-label="Toggle power saver"
      aria-pressed={enabled() ? "true" : "false"}
      data-active={enabled() ? "true" : "false"}
      class={styles.button}
      onClick={toggle}
    >
      ⌁
    </button>
  );
}
