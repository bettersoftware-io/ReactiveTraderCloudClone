import type { JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";

import type { ColumnFilter, Comparator } from "@rtc/client-core";

import styles from "./DateFilter.module.css";

export function DateFilter<TRow>(props: DateFilterProps<TRow>): JSX.Element {
  const [comparator, setComparator] = createSignal<Comparator>(
    props.currentFilter?.type === "date"
      ? props.currentFilter.comparator
      : "eq",
  );
  const [value, setValue] = createSignal(
    props.currentFilter?.type === "date" ? props.currentFilter.value : "",
  );
  const [valueTo, setValueTo] = createSignal(
    props.currentFilter?.type === "date" && props.currentFilter.valueTo
      ? props.currentFilter.valueTo
      : "",
  );

  function handleApply(): void {
    if (!value()) {
      props.onApply(null);
      return;
    }

    props.onApply({
      type: "date",
      column: props.column,
      comparator: comparator(),
      value: value(),
      valueTo: comparator() === "inRange" ? valueTo() : undefined,
    });
  }

  return (
    <div class={styles.container}>
      <select
        data-testid="date-filter-comparator"
        value={comparator()}
        onChange={(e: SelectChangeEvent): void => {
          setComparator(e.currentTarget.value as Comparator);
        }}
        class={styles.select}
      >
        <For each={comparators}>
          {(c: ComparatorOption) => {
            return <option value={c.value}>{c.label}</option>;
          }}
        </For>
      </select>
      <input
        type="date"
        data-testid="date-filter-value"
        value={value()}
        onChange={(e: InputChangeEvent): void => {
          setValue(e.currentTarget.value);
        }}
        class={styles.input}
      />
      <Show when={comparator() === "inRange"}>
        <input
          type="date"
          data-testid="date-filter-value-to"
          value={valueTo()}
          onChange={(e: InputChangeEvent): void => {
            setValueTo(e.currentTarget.value);
          }}
          class={styles.input}
        />
      </Show>
      <div class={styles.buttons}>
        <button
          type="button"
          data-testid="date-filter-apply"
          onClick={handleApply}
          class={styles.applyBtn}
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => {
            props.onApply(null);
          }}
          class={styles.resetBtn}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

interface DateFilterProps<TRow> {
  column: keyof TRow;
  currentFilter: ColumnFilter<TRow> | undefined;
  onApply: (filter: ColumnFilter<TRow> | null) => void;
}

type SelectChangeEvent = Event & { currentTarget: HTMLSelectElement };
type InputChangeEvent = Event & { currentTarget: HTMLInputElement };

interface ComparatorOption {
  value: Comparator;
  label: string;
}

const comparators: ComparatorOption[] = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Not equal" },
  { value: "lt", label: "Less than" },
  { value: "lte", label: "Less than or equals" },
  { value: "gt", label: "Greater than" },
  { value: "gte", label: "Greater than or equals" },
  { value: "inRange", label: "In range" },
];
