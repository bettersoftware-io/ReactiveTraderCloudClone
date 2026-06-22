import { NumberFilter } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

import type { ColumnFilter } from "#/ui/fx/blotter/columnFilter/filterState";

describe("NumberFilter", () => {
  it("defaults to the equals comparator with an empty value", () => {
    const filter = mount(NumberFilter, {
      props: {
        column: "notional",
        currentFilter: undefined,
        onApply: () => {},
      },
    });
    expect(filter.comparator()).toBe("eq");
    expect(filter.value()).toBe("");
    expect(filter.hasRangeInput()).toBe(false);
  });

  it("seeds its fields from an existing number filter", () => {
    const current: ColumnFilter = {
      type: "number",
      column: "notional",
      comparator: "gt",
      value: 1000,
    };
    const filter = mount(NumberFilter, {
      props: { column: "notional", currentFilter: current, onApply: () => {} },
    });
    expect(filter.comparator()).toBe("gt");
    expect(filter.value()).toBe("1000");
  });

  it("seeds the range 'to' field from an in-range filter", () => {
    const current: ColumnFilter = {
      type: "number",
      column: "notional",
      comparator: "inRange",
      value: 100,
      valueTo: 500,
    };
    const filter = mount(NumberFilter, {
      props: { column: "notional", currentFilter: current, onApply: () => {} },
    });
    expect(filter.hasRangeInput()).toBe(true);
  });

  it("emits a number filter on apply", async () => {
    let applied: ColumnFilter | null | undefined;
    const filter = mount(NumberFilter, {
      props: {
        column: "notional",
        currentFilter: undefined,
        onApply: (f) => {
          applied = f;
        },
      },
    });
    await filter.chooseComparator("gte");
    await filter.setValue("250000");
    await filter.apply();
    expect(applied).toMatchObject({
      type: "number",
      column: "notional",
      comparator: "gte",
      value: 250000,
    });
  });

  it("emits an in-range number filter with both bounds", async () => {
    let applied: ColumnFilter | null | undefined;
    const filter = mount(NumberFilter, {
      props: {
        column: "notional",
        currentFilter: undefined,
        onApply: (f) => {
          applied = f;
        },
      },
    });
    await filter.chooseComparator("inRange");
    expect(filter.hasRangeInput()).toBe(true);
    await filter.setValue("100");
    await filter.setRangeTo("500");
    await filter.apply();
    expect(applied).toMatchObject({
      type: "number",
      comparator: "inRange",
      value: 100,
      valueTo: 500,
    });
  });

  it("omits valueTo when the in-range 'to' field is left blank", async () => {
    let applied: ColumnFilter | null | undefined;
    const filter = mount(NumberFilter, {
      props: {
        column: "notional",
        currentFilter: undefined,
        onApply: (f) => {
          applied = f;
        },
      },
    });
    await filter.chooseComparator("inRange");
    await filter.setValue("100");
    // leave the "to" input blank → parseFloat("") is NaN → valueTo undefined
    await filter.apply();
    expect(applied).toMatchObject({
      type: "number",
      comparator: "inRange",
      value: 100,
    });
    expect(
      (applied as Extract<ColumnFilter, { type: "number" }>).valueTo,
    ).toBeUndefined();
  });

  it("clears the filter (null) when the value is not a number", async () => {
    let called = false;
    let applied: ColumnFilter | null | undefined;
    const filter = mount(NumberFilter, {
      props: {
        column: "notional",
        currentFilter: undefined,
        onApply: (f) => {
          called = true;
          applied = f;
        },
      },
    });
    await filter.apply(); // value left blank → parseFloat NaN
    expect(called).toBe(true);
    expect(applied).toBeNull();
  });

  it("resets the filter to null via the Reset button", async () => {
    let applied: ColumnFilter | null | undefined = "unset" as never;
    const filter = mount(NumberFilter, {
      props: {
        column: "notional",
        currentFilter: undefined,
        onApply: (f) => {
          applied = f;
        },
      },
    });
    await filter.reset();
    expect(applied).toBeNull();
  });
});
