import type { ReactElement } from "react";

import styles from "./PreferencesModal.module.css";

interface PrefToggleProps {
  /** Row label (the setting name). */
  label: string;
  /** Optional secondary description line. */
  description?: string;
  /** Current on/off state (reflected on the switch via `data-on`). */
  on: boolean;
  /** Fired when the switch is clicked. */
  onToggle: () => void;
  /** Stable testid for the switch element (e.g. "pref-toggle-animatedBg"). */
  testid: string;
}

/**
 * Reusable preferences row carrying a label/description and an on/off switch
 * (the `.rtSw` control, prototype Reactive Trader.dc.html:44-47). The switch
 * thumb position + glow are driven entirely by the `data-on` attribute in CSS,
 * so the control is a dumb reflection of the `on` prop.
 */
export function PrefToggle({
  label,
  description,
  on,
  onToggle,
  testid,
}: PrefToggleProps): ReactElement {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        {description ? (
          <div className={styles.rowDesc}>{description}</div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        data-testid={testid}
        data-on={on ? "true" : "false"}
        className={styles.sw}
        onClick={onToggle}
      />
    </div>
  );
}
