import type { ReactElement } from "react";

import { useViewModel } from "@rtc/react-bindings";

import styles from "./PowerSaverToggle.module.css";

/**
 * Header cycling control for the power-saver ladder (off → calm → freeze → off).
 * The ⌁ glyph carries a fill indicator (○ ◐ ●) of the current level; the
 * Preferences segmented control is the direct-jump / screen-reader path.
 */
export function PowerSaverToggle(): ReactElement {
  const { usePowerSaver } = useViewModel();
  const { level, cycle } = usePowerSaver();
  return (
    <button
      type="button"
      data-testid="power-saver-toggle"
      aria-label={`Power saver: ${level}. Activate to switch to ${NEXT_LABEL[level]}.`}
      data-level={level}
      data-active={level === "off" ? "false" : "true"}
      className={styles.button}
      onClick={cycle}
    >
      <span aria-hidden="true" className={styles.glyph}>
        ⌁
      </span>
      <span aria-hidden="true" className={styles.fill}>
        {FILL[level]}
      </span>
    </button>
  );
}

const FILL: Record<string, string> = { off: "○", calm: "◐", freeze: "●" };
const NEXT_LABEL: Record<string, string> = {
  off: "Calm",
  calm: "Freeze",
  freeze: "Off",
};
