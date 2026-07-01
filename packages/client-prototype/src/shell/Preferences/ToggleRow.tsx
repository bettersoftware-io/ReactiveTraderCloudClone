import type { ReactElement } from "react";

import styles from "#/shell/Preferences/ToggleRow.module.css";

export interface ToggleRowProps {
  label: string;
  hint?: string;
  on: boolean;
  onToggle(): void;
}

export function ToggleRow(props: ToggleRowProps): ReactElement {
  const { label, hint, on, onToggle } = props;
  return (
    <div className={styles.row}>
      <div className={styles.labelGroup}>
        <div className={styles.label}>{label}</div>
        {hint !== undefined && <div className={styles.hint}>{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        data-on={on ? "true" : "false"}
        onClick={onToggle}
        className={styles.sw}
      />
    </div>
  );
}
