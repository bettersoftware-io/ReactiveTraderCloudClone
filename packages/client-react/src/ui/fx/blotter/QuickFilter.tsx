import type { ChangeEvent, ReactElement } from "react";

import styles from "./QuickFilter.module.css";

interface QuickFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export function QuickFilter({
  value,
  onChange,
}: QuickFilterProps): ReactElement {
  return (
    <input
      data-testid="quick-filter"
      type="text"
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>): void => {
        onChange(e.target.value);
      }}
      placeholder="Quick filter..."
      className={styles.input}
    />
  );
}
