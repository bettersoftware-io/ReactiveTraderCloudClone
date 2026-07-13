import type { JSX } from "solid-js";
import { createSignal, For, Match, Show, Switch } from "solid-js";

import type { ColumnFilter, SortState } from "@rtc/client-core";

import type { ColumnDef } from "./blotterColumns";
import { DateFilter } from "./columnFilter/DateFilter";
import { NumberFilter } from "./columnFilter/NumberFilter";
import { SetFilter } from "./columnFilter/SetFilter";

import styles from "./BlotterHeader.module.css";

export function BlotterHeader<TRow>(
  props: BlotterHeaderProps<TRow>,
): JSX.Element {
  const [openFilter, setOpenFilter] = createSignal<keyof TRow | null>(null);

  return (
    <tr>
      <For each={props.columns}>
        {(col: ColumnDef<TRow>) => {
          return (
            <th
              data-testid={`blotter-sort-${String(col.key)}`}
              class={styles.headerCell}
              aria-sort={ariaSortFor(col.key, props.sort)}
              onClick={() => {
                props.onSort(col.key);
              }}
            >
              <span>
                {col.label}
                <SortIndicator column={col.key} sort={props.sort} />
                <Show when={props.filters.has(col.key)}>
                  <span class={styles.filterDot}>{"●"}</span>
                </Show>
              </span>
              <button
                type="button"
                data-testid={`blotter-filter-toggle-${String(col.key)}`}
                onClick={(e: FilterToggleClickEvent): void => {
                  e.stopPropagation();
                  setOpenFilter(() => {
                    return openFilter() === col.key ? null : col.key;
                  });
                }}
                class={styles.filterToggle}
              >
                {"▽"}
              </button>
              <Show when={openFilter() === col.key}>
                <FilterPanel
                  col={col}
                  rows={props.rows}
                  currentFilter={props.filters.get(col.key)}
                  onApply={(f: ColumnFilter<TRow> | null): void => {
                    props.onFilter(col.key, f);
                  }}
                  onClose={() => {
                    setOpenFilter(null);
                  }}
                />
              </Show>
            </th>
          );
        }}
      </For>
    </tr>
  );
}

type FilterToggleClickEvent = MouseEvent & {
  currentTarget: HTMLButtonElement;
};

interface BlotterHeaderProps<TRow> {
  sort: SortState<TRow>;
  onSort: (column: keyof TRow) => void;
  filters: Map<keyof TRow, ColumnFilter<TRow>>;
  onFilter: (column: keyof TRow, filter: ColumnFilter<TRow> | null) => void;
  rows: readonly TRow[];
  columns: readonly ColumnDef<TRow>[];
}

function ariaSortFor<TRow>(
  column: keyof TRow,
  sort: SortState<TRow>,
): "ascending" | "descending" | undefined {
  if (sort.column !== column || !sort.direction) {
    return undefined;
  }

  return sort.direction === "asc" ? "ascending" : "descending";
}

interface SortIndicatorProps<TRow> {
  column: keyof TRow;
  sort: SortState<TRow>;
}

function SortIndicator<TRow>(props: SortIndicatorProps<TRow>): JSX.Element {
  return (
    <Show when={props.sort.column === props.column && props.sort.direction}>
      <span class={styles.sortIndicator}>
        {props.sort.direction === "asc" ? "▲" : "▼"}
      </span>
    </Show>
  );
}

interface FilterPanelProps<TRow> {
  col: ColumnDef<TRow>;
  rows: readonly TRow[];
  currentFilter: ColumnFilter<TRow> | undefined;
  onApply: (filter: ColumnFilter<TRow> | null) => void;
  onClose: () => void;
}

function FilterPanel<TRow>(props: FilterPanelProps<TRow>): JSX.Element {
  function handleApply(filter: ColumnFilter<TRow> | null): void {
    props.onApply(filter);
    props.onClose();
  }

  return (
    <div class={styles.filterPanel}>
      <Switch>
        <Match when={props.col.filterType === "set"}>
          <SetFilter
            column={props.col.key}
            rows={props.rows}
            currentFilter={props.currentFilter}
            onApply={handleApply}
          />
        </Match>
        <Match when={props.col.filterType === "number"}>
          <NumberFilter
            column={props.col.key}
            currentFilter={props.currentFilter}
            onApply={handleApply}
          />
        </Match>
        <Match when={props.col.filterType === "date"}>
          <DateFilter
            column={props.col.key}
            currentFilter={props.currentFilter}
            onApply={handleApply}
          />
        </Match>
      </Switch>
    </div>
  );
}
