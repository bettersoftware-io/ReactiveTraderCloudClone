import { DateFilter } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import type { ColumnFilter } from "@ui-contract/pages/fx/blotter/filterTypes";
import { describe, expect, it } from "vitest";

describe("DateFilter", () => {
  it("defaults to equals with one date input", () => {
    const filter = mount(DateFilter, {
      props: {
        column: "tradeDate",
        currentFilter: undefined,
        onApply: () => {},
      },
    });
    expect(filter.comparator()).toBe("eq");
    expect(filter.dateInputCount()).toBe(1);
  });

  it("seeds from an existing date filter", () => {
    const current: ColumnFilter = {
      type: "date",
      column: "tradeDate",
      comparator: "lt",
      value: "2026-02-01",
    };

    const filter = mount(DateFilter, {
      props: { column: "tradeDate", currentFilter: current, onApply: () => {} },
    });
    expect(filter.comparator()).toBe("lt");
    expect(filter.value()).toBe("2026-02-01");
  });

  it("shows a second input and seeds valueTo for an in-range filter", () => {
    const current: ColumnFilter = {
      type: "date",
      column: "tradeDate",
      comparator: "inRange",
      value: "2026-01-01",
      valueTo: "2026-03-01",
    };

    const filter = mount(DateFilter, {
      props: { column: "tradeDate", currentFilter: current, onApply: () => {} },
    });
    expect(filter.dateInputCount()).toBe(2);
  });

  it("emits a date filter on apply", async () => {
    let applied: ColumnFilter | null | undefined;
    const filter = mount(DateFilter, {
      props: {
        column: "tradeDate",
        currentFilter: undefined,
        onApply: (f: ColumnFilter | null) => {
          applied = f;
        },
      },
    });
    await filter.chooseComparator("gte");
    filter.setValue("2026-02-15");
    await filter.apply();
    expect(applied).toMatchObject({
      type: "date",
      column: "tradeDate",
      comparator: "gte",
      value: "2026-02-15",
    });
  });

  it("emits an in-range date filter with both bounds", async () => {
    let applied: ColumnFilter | null | undefined;
    const filter = mount(DateFilter, {
      props: {
        column: "tradeDate",
        currentFilter: undefined,
        onApply: (f: ColumnFilter | null) => {
          applied = f;
        },
      },
    });
    await filter.chooseComparator("inRange");
    expect(filter.dateInputCount()).toBe(2);
    filter.setValue("2026-01-01");
    filter.setRangeTo("2026-03-01");
    await filter.apply();
    expect(applied).toMatchObject({
      type: "date",
      comparator: "inRange",
      value: "2026-01-01",
      valueTo: "2026-03-01",
    });
  });

  it("clears the filter (null) when no date is entered", async () => {
    let called = false;
    let applied: ColumnFilter | null | undefined;
    const filter = mount(DateFilter, {
      props: {
        column: "tradeDate",
        currentFilter: undefined,
        onApply: (f: ColumnFilter | null) => {
          called = true;
          applied = f;
        },
      },
    });
    await filter.apply(); // no value entered
    expect(called).toBe(true);
    expect(applied).toBeNull();
  });

  it("resets the filter to null via the Reset button", async () => {
    let applied: ColumnFilter | null | undefined = "unset" as never;
    const filter = mount(DateFilter, {
      props: {
        column: "tradeDate",
        currentFilter: undefined,
        onApply: (f: ColumnFilter | null) => {
          applied = f;
        },
      },
    });
    await filter.reset();
    expect(applied).toBeNull();
  });
});
