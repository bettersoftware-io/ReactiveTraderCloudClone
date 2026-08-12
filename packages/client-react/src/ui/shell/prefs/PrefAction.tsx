import type { ReactElement } from "react";

import styles from "./PreferencesModal.module.css";

/**
 * Reusable preferences row for an ACTION rather than a stored value — a
 * bordered button that fires `onPress` immediately, with no on/off or
 * segment state of its own to reflect back (unlike `PrefToggle`/
 * `PrefSegment`, which both mirror a live preference via `data-on`). First
 * use: "Reset workspace layout" (DATA & PRIVACY).
 */
export function PrefAction({
  label,
  description,
  buttonLabel,
  testid,
  onPress,
}: PrefActionProps): ReactElement {
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
        data-testid={testid}
        className={styles.actionButton}
        onClick={onPress}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

interface PrefActionProps {
  /** Row label (the setting name). */
  label: string;
  /** Optional secondary description line. */
  description?: string;
  /** The button's visible copy (e.g. "RESET"). */
  buttonLabel: string;
  /** Stable testid for the button element. */
  testid: string;
  /** Fired when the button is clicked — a slot: this row doesn't know (or
   * care) what the action does. */
  onPress: () => void;
}
