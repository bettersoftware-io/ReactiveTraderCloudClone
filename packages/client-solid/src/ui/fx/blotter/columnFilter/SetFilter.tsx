import type { JSX } from "solid-js";
import { createMemo, createSignal, For } from "solid-js";

import type { ColumnFilter } from "@rtc/client-core";

import styles from "./SetFilter.module.css";

export function SetFilter<TRow>(props: SetFilterProps<TRow>): JSX.Element {
  // Reactive over `props.rows`: the filter popover stays mounted while new
  // trades keep arriving (BlotterRow's live subscription doesn't unmount
  // it), so the option list must track the current row set, not just
  // whatever existed the instant the popover opened. A plain top-level
  // const here would freeze at mount (Solid components run their setup body
  // once) — the react original recomputes this every render for free.
  const allValues = createMemo((): string[] => {
    const valSet = new Set<string>();

    for (const row of props.rows) {
      valSet.add(String(row[props.column]));
    }

    return [...valSet].sort();
  });

  const [selected, setSelected] = createSignal<Set<string>>(
    // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
    props.currentFilter?.type === "set"
      ? // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
        new Set(props.currentFilter.values)
      : // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
        new Set(allValues()),
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
    if (selected().size === allValues().length) {
      props.onApply(null); // all selected = no filter
    } else {
      props.onApply({ type: "set", column: props.column, values: selected() });
    }
  }

  return (
    <div class={styles.container}>
      <For each={allValues()}>
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
