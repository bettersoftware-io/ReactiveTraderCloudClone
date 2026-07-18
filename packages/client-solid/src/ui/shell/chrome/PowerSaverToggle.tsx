import type { JSX } from "solid-js";

import { nextPowerSaverLevel, type PowerSaverLevel } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./PowerSaverToggle.module.css";

/**
 * Header cycling control for the power-saver ladder (off → calm → freeze → off).
 * The ⌁ glyph carries a fill indicator (○ ◐ ●) of the current level; the
 * Preferences segmented control is the direct-jump / screen-reader path.
 */
export function PowerSaverToggle(): JSX.Element {
  const { usePowerSaver } = useViewModel();
  const { level, cycle } = usePowerSaver();
  return (
    <button
      type="button"
      data-testid="power-saver-toggle"
      aria-label={`Power saver: ${LABEL[level()]}. Activate to switch to ${LABEL[nextPowerSaverLevel(level())]}.`}
      data-level={level()}
      data-active={level() === "off" ? "false" : "true"}
      class={styles.button}
      onClick={cycle}
    >
      <span aria-hidden="true" class={styles.glyph}>
        ⌁
      </span>
      <span aria-hidden="true" class={styles.fill}>
        {FILL[level()]}
      </span>
    </button>
  );
}

const FILL: Record<PowerSaverLevel, string> = {
  off: "○",
  calm: "◐",
  freeze: "●",
};
const LABEL: Record<PowerSaverLevel, string> = {
  off: "Off",
  calm: "Calm",
  freeze: "Freeze",
};
