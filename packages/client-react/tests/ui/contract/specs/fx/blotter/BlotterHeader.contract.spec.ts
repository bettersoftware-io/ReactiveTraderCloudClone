import { BlotterHeader } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import type { ColumnFilter } from "../../../../../../src/ui/fx/blotter/columnFilter/filterState";

const trade = (over: Partial<Trade> = {}): Trade => ({
  tradeId: 1,
  tradeName: "Alice",
  currencyPair: "EURUSD",
  notional: 1_000_000,
  dealtCurrency: "EUR",
  direction: Direction.Buy,
  spotRate: 1.1,
  status: TradeStatus.Done,
  tradeDate: "2026-01-01",
  valueDate: "2026-01-03",
  ...over,
});

const noSort = { column: null, direction: null } as const;

describe("BlotterHeader", () => {
  it("renders every column label", () => {
    const header = mount(BlotterHeader, {
      props: {
        sort: noSort,
        onSort: () => {},
        filters: new Map(),
        onFilter: () => {},
        trades: [],
      },
    });
    expect(header.labels()).toEqual([
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
    ]);
  });

  it("reports the clicked column to onSort", async () => {
    const sorted: (keyof Trade)[] = [];
    const header = mount(BlotterHeader, {
      props: {
        sort: noSort,
        onSort: (c) => sorted.push(c),
        filters: new Map(),
        onFilter: () => {},
        trades: [],
      },
    });
    await header.clickHeader("Notional");
    expect(sorted).toEqual(["notional"]);
  });

  it("shows the ascending indicator when a column is sorted ascending", () => {
    const header = mount(BlotterHeader, {
      props: {
        sort: { column: "tradeName", direction: "asc" },
        onSort: () => {},
        filters: new Map(),
        onFilter: () => {},
        trades: [],
      },
    });
    expect(header.showsAscending("Trader")).toBe(true);
    expect(header.showsDescending("Trader")).toBe(false);
  });

  it("shows the descending indicator when a column is sorted descending", () => {
    const header = mount(BlotterHeader, {
      props: {
        sort: { column: "notional", direction: "desc" },
        onSort: () => {},
        filters: new Map(),
        onFilter: () => {},
        trades: [],
      },
    });
    expect(header.showsDescending("Notional")).toBe(true);
  });

  it("opens a set-filter panel for a set column", async () => {
    const header = mount(BlotterHeader, {
      props: {
        sort: noSort,
        onSort: () => {},
        filters: new Map(),
        onFilter: () => {},
        trades: [
          trade({ currencyPair: "EURUSD" }),
          trade({ currencyPair: "USDJPY" }),
        ],
      },
    });
    expect(header.filterPanelOpen("CCYCCY")).toBe(false);
    await header.openFilter("CCYCCY");
    expect(header.filterPanelOpen("CCYCCY")).toBe(true);
  });

  it("opens a number-filter panel for a numeric column", async () => {
    const header = mount(BlotterHeader, {
      props: {
        sort: noSort,
        onSort: () => {},
        filters: new Map(),
        onFilter: () => {},
        trades: [trade()],
      },
    });
    await header.openFilter("Notional");
    expect(header.filterPanelOpen("Notional")).toBe(true);
  });

  it("opens a date-filter panel for a date column", async () => {
    const header = mount(BlotterHeader, {
      props: {
        sort: noSort,
        onSort: () => {},
        filters: new Map(),
        onFilter: () => {},
        trades: [trade()],
      },
    });
    await header.openFilter("Trade Date");
    expect(header.filterPanelOpen("Trade Date")).toBe(true);
  });

  it("toggles the filter panel closed on a second toggle click", async () => {
    const header = mount(BlotterHeader, {
      props: {
        sort: noSort,
        onSort: () => {},
        filters: new Map(),
        onFilter: () => {},
        trades: [trade()],
      },
    });
    await header.openFilter("Notional");
    expect(header.filterPanelOpen("Notional")).toBe(true);
    await header.openFilter("Notional");
    expect(header.filterPanelOpen("Notional")).toBe(false);
  });

  it("forwards an applied filter to onFilter and closes the panel", async () => {
    const applied: { column: keyof Trade; filter: ColumnFilter | null }[] = [];
    const header = mount(BlotterHeader, {
      props: {
        sort: noSort,
        onSort: () => {},
        filters: new Map(),
        onFilter: (column, filter) => applied.push({ column, filter }),
        trades: [trade()],
      },
    });
    await header.openFilter("Notional");
    await header.applyNumberFilter("Notional", "gt", "500000");
    expect(applied).toHaveLength(1);
    expect(applied[0].column).toBe("notional");
    expect(header.filterPanelOpen("Notional")).toBe(false);
  });

  it("marks a column that has an active filter", () => {
    const filters = new Map<keyof Trade, ColumnFilter>([
      [
        "currencyPair",
        { type: "set", column: "currencyPair", values: new Set(["EURUSD"]) },
      ],
    ]);
    const header = mount(BlotterHeader, {
      props: {
        sort: noSort,
        onSort: () => {},
        filters,
        onFilter: () => {},
        trades: [trade()],
      },
    });
    expect(header.hasActiveFilterDot("CCYCCY")).toBe(true);
    expect(header.hasActiveFilterDot("Notional")).toBe(false);
  });
});
