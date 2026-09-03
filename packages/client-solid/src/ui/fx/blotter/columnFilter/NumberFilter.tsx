import type { JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";

import type { ColumnFilter, Comparator } from "@rtc/client-core";

import styles from "./NumberFilter.module.css";

export function NumberFilter<TRow>(
  props: NumberFilterProps<TRow>,
): JSX.Element {
  // props.currentFilter is read once, by design, to SEED this popover's
  // local editing state: BlotterHeader mounts this component only inside
  // <Show when={openFilter() === col.key}> (a boolean, non-keyed Show around
  // <FilterPanel>) — every open toggles that condition false→true, fully
  // remounting NumberFilter fresh with whatever currentFilter is live at
  // that moment, and it unmounts again on close. currentFilter can never
  // change out from under an already-open instance without that remount.
  const [comparator, setComparator] = createSignal<Comparator>(
    // eslint-disable-next-line solid/reactivity -- setup-scope read is correct (see doc comment above)
    props.currentFilter?.type === "number"
      ? // eslint-disable-next-line solid/reactivity -- setup-scope read is correct (see doc comment above)
        props.currentFilter.comparator
      : "eq",
  );

  const [value, setValue] = createSignal(
    // eslint-disable-next-line solid/reactivity -- setup-scope read is correct (see doc comment above)
    props.currentFilter?.type === "number"
      ? // eslint-disable-next-line solid/reactivity -- setup-scope read is correct (see doc comment above)
        String(props.currentFilter.value)
      : "",
  );

  const [valueTo, setValueTo] = createSignal(
    // eslint-disable-next-line solid/reactivity -- setup-scope read is correct (see doc comment above)
    props.currentFilter?.type === "number" &&
      // eslint-disable-next-line solid/reactivity -- setup-scope read is correct (see doc comment above)
      props.currentFilter.valueTo != null
      ? // eslint-disable-next-line solid/reactivity -- setup-scope read is correct (see doc comment above)
        String(props.currentFilter.valueTo)
      : "",
  );

  function changeComparator(e: SelectChangeEvent): void {
    setComparator(e.currentTarget.value as Comparator);
  }

  function changeValue(e: InputChangeEvent): void {
    setValue(e.currentTarget.value);
  }

  function changeValueTo(e: InputChangeEvent): void {
    setValueTo(e.currentTarget.value);
  }

  function resetNumberFilter(): void {
    props.onApply(null);
  }

  function applyNumberFilter(): void {
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
        onChange={changeComparator}
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
        onInput={changeValue}
        onChange={changeValue}
        placeholder="Value"
        class={styles.input}
      />
      <Show when={comparator() === "inRange"}>
        <input
          type="number"
          data-testid="number-filter-value-to"
          value={valueTo()}
          onInput={changeValueTo}
          onChange={changeValueTo}
          placeholder="To"
          class={styles.input}
        />
      </Show>
      <div class={styles.buttons}>
        <button
          type="button"
          data-testid="number-filter-apply"
          onClick={applyNumberFilter}
          class={styles.applyBtn}
        >
          Apply
        </button>
        <button
          type="button"
          onClick={resetNumberFilter}
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
