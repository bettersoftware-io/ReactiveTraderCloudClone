import type { ChangeEvent, ReactElement } from "react";

import styles from "./QuickFilter.module.css";

export function QuickFilter({
  value,
  onChange,
}: QuickFilterProps): ReactElement {
  function changeQuickFilter(e: ChangeEvent<HTMLInputElement>): void {
    onChange(e.target.value);
  }

  return (
    <input
      data-testid="quick-filter"
      type="text"
      value={value}
      onChange={changeQuickFilter}
      placeholder="Quick filter..."
      className={styles.input}
    />
  );
}

interface QuickFilterProps {
  value: string;
  onChange: (value: string) => void;
}
