import type { ReactElement } from "react";

import styles from "#/shell/Preferences/SegmentedControl.module.css";

export interface SegmentedControlProps {
  label: string;
  options: string[];
  value: string;
  onSelect(opt: string): void;
}

export function SegmentedControl(props: SegmentedControlProps): ReactElement {
  const { label, options, value, onSelect } = props;
  return (
    <div className={styles.control}>
      <div className={styles.label}>{label}</div>
      <div className={styles.options}>
        {options.map((opt) => {
          return (
            <button
              key={opt}
              type="button"
              className={styles.option}
              data-on={opt === value ? "true" : "false"}
              onClick={() => {
                onSelect(opt);
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
