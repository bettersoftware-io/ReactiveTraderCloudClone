import { useState } from "react";

import { downloadCsv, toCsv } from "#/fx/csvExport";
import type { Trade } from "#/fx/types";

type SortField =
  | "tradeId"
  | "status"
  | "tradeDate"
  | "direction"
  | "symbol"
  | "dealtCurrency"
  | "notional"
  | "spotRate"
  | "valueDate"
  | "traderName";

interface SortState {
  field: SortField;
  dir: 1 | -1;
}

export interface BlotterApi {
  rows: Trade[];
  sort: { field: SortField; dir: 1 | -1 };
  query: string;
  count: number;
  onSort(f: SortField): void;
  onQuery(v: string): void;
  onExport(): void;
  cols: { field: SortField; label: string; ind: string }[];
}

// PROTO 1306: the blotter's column defs, in display order.
const COL_DEFS: readonly [SortField, string][] = [
  ["tradeId", "ID"],
  ["status", "Status"],
  ["tradeDate", "Date"],
  ["direction", "Dir"],
  ["symbol", "CCYCCY"],
  ["dealtCurrency", "Deal"],
  ["notional", "Notional"],
  ["spotRate", "Rate"],
  ["valueDate", "Value"],
  ["traderName", "Trader"],
];

// PROTO 1160 (exportFx): CSV header row, in the same column order as COL_DEFS.
const CSV_HEADERS = [
  "Trade ID",
  "Status",
  "Trade Date",
  "Direction",
  "CCYCCY",
  "Deal CCY",
  "Notional",
  "Rate",
  "Value Date",
  "Trader",
];

const EXPORT_FILENAME = "fx-trades.csv";

// PROTO 1162 (_fxRows): the `val()` sort-key extractor.
function sortValue(t: Trade, field: SortField): string | number {
  switch (field) {
    case "tradeId":
      return t.id;
    case "notional":
      return t.notionalNum;
    case "spotRate":
      return parseFloat(t.rate);
    case "status":
      return t.status;
    case "direction":
      return t.dir;
    case "symbol":
      return t.symbol;
    case "dealtCurrency":
      return t.dealtCcy;
    case "tradeDate":
      return t.tradeDate;
    case "valueDate":
      return t.valueDate;
    case "traderName":
      return t.trader;
    default:
      return t.id;
  }
}

// PROTO 1162 (_fxRows): filter by a lowercased query joined over the
// displayed fields, case-insensitive substring match.
function filterRows(trades: Trade[], query: string): Trade[] {
  const q = query.trim().toLowerCase();

  if (!q) {
    return trades.slice();
  }

  return trades.filter((t) => {
    return [
      t.id,
      t.status,
      t.dir,
      t.symbol,
      t.dealtCcy,
      t.notional,
      t.rate,
      t.trader,
      t.tradeDate,
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

// PROTO 1162 (_fxRows): comparator returns -dir/+dir so `dir: -1` (the
// default) sorts descending and `dir: 1` sorts ascending.
function sortRows(rows: Trade[], sort: SortState): Trade[] {
  const sorted = rows.slice();

  sorted.sort((a, b) => {
    const va = sortValue(a, sort.field);
    const vb = sortValue(b, sort.field);

    if (va < vb) {
      return -sort.dir;
    }

    if (va > vb) {
      return sort.dir;
    }

    return 0;
  });

  return sorted;
}

export function useFxBlotter(trades: Trade[]): BlotterApi {
  const [sort, setSort] = useState<SortState>({ field: "tradeId", dir: -1 });
  const [query, setQuery] = useState("");

  // PROTO 1157 (fxSortClick): toggle direction on the active field, else
  // switch to the new field ascending.
  function onSort(f: SortField): void {
    setSort((prev) => {
      const dir: 1 | -1 = prev.field === f ? (-prev.dir as 1 | -1) : 1;
      return { field: f, dir };
    });
  }

  function onQuery(v: string): void {
    setQuery(v);
  }

  const rows = sortRows(filterRows(trades, query), sort);

  // PROTO 1160 (exportFx): build the CSV in header-column order, then
  // trigger the download.
  function onExport(): void {
    const csv = toCsv(
      CSV_HEADERS,
      rows.map((t) => {
        return [
          t.id,
          t.status,
          t.tradeDate,
          t.dir,
          t.symbol,
          t.dealtCcy,
          t.notional,
          t.rate,
          t.valueDate,
          t.trader,
        ];
      }),
    );
    downloadCsv(EXPORT_FILENAME, csv);
  }

  const cols = COL_DEFS.map(([field, label]) => {
    return {
      field,
      label,
      ind: sort.field === field ? (sort.dir > 0 ? " ▲" : " ▼") : "",
    };
  });

  return {
    rows,
    sort,
    query,
    count: rows.length,
    onSort,
    onQuery,
    onExport,
    cols,
  };
}
