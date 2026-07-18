import type { JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";

import type { ColumnFilter, Comparator } from "@rtc/client-core";

import styles from "./NumberFilter.module.css";

export function NumberFilter<TRow>(
  props: NumberFilterProps<TRow>,
): JSX.Element {
  const [comparator, setComparator] = createSignal<Comparator>(
    // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
    props.currentFilter?.type === "number"
      ? // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
        props.currentFilter.comparator
      : "eq",
  );

  const [value, setValue] = createSignal(
    // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
    props.currentFilter?.type === "number"
      ? // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
        String(props.currentFilter.value)
      : "",
  );

  const [valueTo, setValueTo] = createSignal(
    // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
    props.currentFilter?.type === "number" &&
      // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
      props.currentFilter.valueTo != null
      ? // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
        String(props.currentFilter.valueTo)
      : "",
  );

  function handleApply(): void {
    const num = Number.parseFloat(value());

    if (Number.isNaN(num)) {
      props.onApply(null);
      return;
    }

    const numTo =
      comparator() === "inRange" ? Number.parseFloat(valueTo()) : undefined;
    props.onApply({
      type: "number",
      column: props.column,
      comparator: comparator(),
      value: num,
      valueTo: numTo !== undefined && !Number.isNaN(numTo) ? numTo : undefined,
    });
  }

  return (
    <div class={styles.container}>
      <select
        data-testid="number-filter-comparator"
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
        type="number"
        data-testid="number-filter-value"
        value={value()}
        // React's onChange fires per keystroke (native `input` event);
        // Solid's onChange maps to native `change` only (fires on blur) —
        // both wired here so real typing (`input`) and a programmatic
        // `change` dispatch both narrow live (wiring both is idempotent,
        // see TileNotional's identical comment).
        onInput={(e: InputChangeEvent): void => {
          setValue(e.currentTarget.value);
        }}
        onChange={(e: InputChangeEvent): void => {
          setValue(e.currentTarget.value);
        }}
        placeholder="Value"
        class={styles.input}
      />
      <Show when={comparator() === "inRange"}>
        <input
          type="number"
          data-testid="number-filter-value-to"
          value={valueTo()}
          onInput={(e: InputChangeEvent): void => {
            setValueTo(e.currentTarget.value);
          }}
          onChange={(e: InputChangeEvent): void => {
            setValueTo(e.currentTarget.value);
          }}
          placeholder="To"
          class={styles.input}
        />
      </Show>
      <div class={styles.buttons}>
        <button
          type="button"
          data-testid="number-filter-apply"
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

interface NumberFilterProps<TRow> {
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
