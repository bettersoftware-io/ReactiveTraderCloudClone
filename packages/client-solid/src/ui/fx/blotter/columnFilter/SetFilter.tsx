import type { JSX } from "solid-js";
import { createSignal, For } from "solid-js";

import type { ColumnFilter } from "@rtc/client-core";

import styles from "./SetFilter.module.css";

export function SetFilter<TRow>(props: SetFilterProps<TRow>): JSX.Element {
  const valSet = new Set<string>();

  for (const row of props.rows) {
    valSet.add(String(row[props.column]));
  }

  const allValues = [...valSet].sort();

  const [selected, setSelected] = createSignal<Set<string>>(
    props.currentFilter?.type === "set"
      ? new Set(props.currentFilter.values)
      : new Set(allValues),
  );

  function toggleValue(val: string): void {
    setSelected((prev) => {
      const next = new Set(prev);

      if (next.has(val)) {
        next.delete(val);
      } else {
        next.add(val);
      }

      return next;
    });
  }

  function handleApply(): void {
    if (selected().size === allValues.length) {
      props.onApply(null); // all selected = no filter
    } else {
      props.onApply({ type: "set", column: props.column, values: selected() });
    }
  }

  return (
    <div class={styles.container}>
      <For each={allValues}>
        {(val: string) => {
          return (
            <label class={styles.option}>
              <input
                type="checkbox"
                data-testid={`set-filter-option-${val}`}
                checked={selected().has(val)}
                onChange={() => {
                  toggleValue(val);
                }}
              />
              {val}
            </label>
          );
        }}
      </For>
      <button
        type="button"
        data-testid="set-filter-apply"
        onClick={handleApply}
        class={styles.applyBtn}
      >
        Apply
      </button>
    </div>
  );
}

interface SetFilterProps<TRow> {
  column: keyof TRow;
  rows: readonly TRow[];
  currentFilter: ColumnFilter<TRow> | undefined;
  onApply: (filter: ColumnFilter<TRow> | null) => void;
}
