import type { ReactElement } from "react";

import styles from "./PreferencesModal.module.css";

/**
 * Reusable preferences row carrying a label and a segmented button group (the
 * `.rtSeg` controls, prototype Reactive Trader.dc.html:48-50). The active
 * segment is driven by the `data-on` attribute in CSS, so the control is a dumb
 * reflection of the `value` prop.
 */
export function PrefSegment({
  label,
  description,
  options,
  value,
  onChange,
  testid,
}: PrefSegmentProps): ReactElement {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        {description ? (
          <div className={styles.rowDesc}>{description}</div>
        ) : null}
      </div>
      <div className={styles.seg}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              data-testid={`${testid}-${option.value}`}
              data-on={active ? "true" : "false"}
              className={styles.segButton}
              onClick={() => {
                onChange(option.value);
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface PrefSegmentOption {
  /** Stable value identifying the option. */
  value: string;
  /** Visible label. */
  label: string;
}

interface PrefSegmentProps {
  /** Row label (the setting name). */
  label: string;
  /** Optional secondary description line. */
  description?: string;
  /** The selectable options, in render order. */
  options: readonly PrefSegmentOption[];
  /** The currently-selected option value (reflected via `data-on`). */
  value: string;
  /** Fired with the chosen value when a segment is clicked. */
  onChange: (value: string) => void;
  /** Stable testid prefix; each button gets `${testid}-${option.value}`. */
  testid: string;
}
