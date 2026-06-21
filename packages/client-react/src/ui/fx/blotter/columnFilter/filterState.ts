import type { Trade } from "@rtc/domain";

export type Comparator =
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "inRange";

export type ColumnFilter =
  | { type: "set"; column: keyof Trade; values: Set<string> }
  | {
      type: "number";
      column: keyof Trade;
      comparator: Comparator;
      value: number;
      valueTo?: number;
    }
  | {
      type: "date";
      column: keyof Trade;
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

function matchesFilter(trade: Trade, filter: ColumnFilter): boolean {
  if (filter.type === "set") {
    return filter.values.has(String(trade[filter.column]));
  }
  if (filter.type === "number") {
    const val = trade[filter.column];
    if (typeof val !== "number") return true;
    return matchesNumber(val, filter.comparator, filter.value, filter.valueTo);
  }
  if (filter.type === "date") {
    const val = String(trade[filter.column]);
    return matchesDate(val, filter.comparator, filter.value, filter.valueTo);
  }
  return true;
}

export function applyFilters(
  trades: readonly Trade[],
  filters: Map<keyof Trade, ColumnFilter>,
  quickFilter: string,
): readonly Trade[] {
  let result = trades;

  // Column filters (AND logic)
  if (filters.size > 0) {
    result = result.filter((trade) => {
      for (const filter of filters.values()) {
        if (!matchesFilter(trade, filter)) return false;
      }
      return true;
    });
  }

  // Quick filter: space-separated terms, all must match (AND)
  if (quickFilter.trim()) {
    const terms = quickFilter
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    result = result.filter((trade) => {
      const rowText = Object.values(trade).join(" ").toLowerCase();
      return terms.every((term) => rowText.includes(term));
    });
  }

  return result;
}
