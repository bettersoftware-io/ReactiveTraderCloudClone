import type { Trade } from "@rtc/domain";

export type Comparator = "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "inRange";

export type ColumnFilter<TRow = Trade> =
  | { type: "set"; column: keyof TRow; values: Set<string> }
  | {
      type: "number";
      column: keyof TRow;
      comparator: Comparator;
      value: number;
      valueTo?: number;
    }
  | {
      type: "date";
      column: keyof TRow;
      comparator: Comparator;
      value: string;
      valueTo?: string;
    };

function matchesNumber(
  actual: number,
  comparator: Comparator,
  value: number,
  valueTo?: number,
): boolean {
  switch (comparator) {
    case "eq":
      return actual === value;
    case "neq":
      return actual !== value;
    case "lt":
      return actual < value;
    case "lte":
      return actual <= value;
    case "gt":
      return actual > value;
    case "gte":
      return actual >= value;
    case "inRange":
      return actual >= value && actual <= (valueTo ?? value);
  }
}

function matchesDate(
  actual: string,
  comparator: Comparator,
  value: string,
  valueTo?: string,
): boolean {
  // Date strings are ISO format, comparable lexicographically
  switch (comparator) {
    case "eq":
      return actual === value;
    case "neq":
      return actual !== value;
    case "lt":
      return actual < value;
    case "lte":
      return actual <= value;
    case "gt":
      return actual > value;
    case "gte":
      return actual >= value;
    case "inRange":
      return actual >= value && actual <= (valueTo ?? value);
  }
}

function matchesFilter<TRow>(row: TRow, filter: ColumnFilter<TRow>): boolean {
  if (filter.type === "set") {
    return filter.values.has(String(row[filter.column]));
  }

  if (filter.type === "number") {
    const val = row[filter.column];
    if (typeof val !== "number") return true;
    return matchesNumber(val, filter.comparator, filter.value, filter.valueTo);
  }

  if (filter.type === "date") {
    const val = String(row[filter.column]);
    return matchesDate(val, filter.comparator, filter.value, filter.valueTo);
  }

  return true;
}

export function applyFilters<TRow>(
  rows: readonly TRow[],
  filters: Map<keyof TRow, ColumnFilter<TRow>>,
  quickFilter: string,
): readonly TRow[] {
  let result = rows;

  // Column filters (AND logic)
  if (filters.size > 0) {
    result = result.filter((row) => {
      for (const filter of filters.values()) {
        if (!matchesFilter(row, filter)) return false;
      }

      return true;
    });
  }

  // Quick filter: space-separated terms, all must match (AND)
  if (quickFilter.trim()) {
    const terms = quickFilter.toLowerCase().split(/\s+/).filter(Boolean);
    result = result.filter((row) => {
      const rowText = Object.values(row as object).join(" ").toLowerCase();
      return terms.every((term) => {
        return rowText.includes(term);
      });
    });
  }

  return result;
}
