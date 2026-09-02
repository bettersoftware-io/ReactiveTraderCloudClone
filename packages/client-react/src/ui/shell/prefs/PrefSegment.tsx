import type { ReactElement } from "react";

import styles from "./PreferencesContent.module.css";

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
  disabled,
}: PrefSegmentProps): ReactElement {
  function selectOption(next: string) {
    return () => {
      onChange(next);
    };
  }

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
          const optionDisabled = disabled === true || option.disabled === true;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              disabled={optionDisabled}
              title={option.title}
              data-testid={`${testid}-${option.value}`}
              data-on={active ? "true" : "false"}
              className={styles.segButton}
              onClick={selectOption(option.value)}
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
  /** Disables just this option's button (native `disabled`, no `onChange`
   * on click), independent of the row-level `disabled` prop — e.g. a
   * brain the server isn't currently offering. */
  disabled?: boolean;
  /** Forwarded verbatim to the button's native `title` — a hover tooltip
   * explaining WHY an option is disabled (e.g. a budget-gated brain's reset
   * time), independent of the row-level description line. */
  title?: string;
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
  /** Disables every option in the row — e.g. the effort row while the
   * selected brain is "scripted" (which has no notion of effort). */
  disabled?: boolean;
}
