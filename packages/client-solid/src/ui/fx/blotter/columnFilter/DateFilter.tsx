import type { JSX } from "solid-js";
import { createSignal, For, Show, untrack } from "solid-js";

import type { ColumnFilter, Comparator } from "@rtc/client-core";

import styles from "./DateFilter.module.css";

export function DateFilter<TRow>(props: DateFilterProps<TRow>): JSX.Element {
  // Seeded then owned by the user, exactly as in NumberFilter.tsx: a
  // deliberate snapshot, spelt `untrack` — reading live would overwrite
  // half-typed input whenever anything else re-applied a filter.
  const seed = untrack((): DateFilterSeed => {
    const applied = props.currentFilter;

    if (applied?.type !== "date") {
      return { comparator: "eq", value: "", valueTo: "" };
    }

    return {
      comparator: applied.comparator,
      value: applied.value,
      valueTo: applied.valueTo ?? "",
    };
  });

  const [comparator, setComparator] = createSignal<Comparator>(seed.comparator);
  const [value, setValue] = createSignal(seed.value);
  const [valueTo, setValueTo] = createSignal(seed.valueTo);

  function changeComparator(e: SelectChangeEvent): void {
    setComparator(e.currentTarget.value as Comparator);
  }

  function changeValue(e: InputChangeEvent): void {
    setValue(e.currentTarget.value);
  }

  function changeValueTo(e: InputChangeEvent): void {
    setValueTo(e.currentTarget.value);
  }

  function resetDateFilter(): void {
    props.onApply(null);
  }

  function applyDateFilter(): void {
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
        type="date"
        data-testid="date-filter-value"
        value={value()}
        // Native date inputs report edits via `change` (browsers don't fire
        // `input` reliably per keystroke for them, and the contract spec's
        // DateFilterPage drives them with `fireEvent.change` for exactly
        // that reason) — `onInput` wired too for real-typing UX parity;
        // wiring both is idempotent (see TileNotional's identical comment).
        onInput={changeValue}
        onChange={changeValue}
        class={styles.input}
      />
      <Show when={comparator() === "inRange"}>
        <input
          type="date"
          data-testid="date-filter-value-to"
          value={valueTo()}
          onInput={changeValueTo}
          onChange={changeValueTo}
          class={styles.input}
        />
      </Show>
      <div class={styles.buttons}>
        <button
          type="button"
          data-testid="date-filter-apply"
          onClick={applyDateFilter}
          class={styles.applyBtn}
        >
          Apply
        </button>
        <button type="button" onClick={resetDateFilter} class={styles.resetBtn}>
          Reset
        </button>
      </div>
    </div>
  );
}

interface DateFilterSeed {
  comparator: Comparator;
  value: string;
  valueTo: string;
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
