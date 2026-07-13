import type { JSX } from "solid-js";

import styles from "./QuickFilter.module.css";

export function QuickFilter(props: QuickFilterProps): JSX.Element {
  return (
    <input
      data-testid="quick-filter"
      type="text"
      value={props.value}
      onChange={(e: InputChangeEvent): void => {
        props.onChange(e.currentTarget.value);
      }}
      placeholder="Quick filter..."
      class={styles.input}
    />
  );
}

interface QuickFilterProps {
  value: string;
  onChange: (value: string) => void;
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };
