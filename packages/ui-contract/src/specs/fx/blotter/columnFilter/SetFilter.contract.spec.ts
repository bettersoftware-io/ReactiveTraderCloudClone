import { SetFilter } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import type { ColumnFilter } from "@ui-contract/pages/fx/blotter/filterTypes";
import { describe, expect, it } from "vitest";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

const trades = [
  trade({ currencyPair: "EURUSD" }),
  trade({ currencyPair: "USDJPY" }),
  trade({ currencyPair: "GBPUSD" }),
];

describe("SetFilter", () => {
  it("lists every distinct value, sorted, all checked by default", () => {
    const filter = mount(SetFilter, {
      props: {
        column: "currencyPair",
        trades,
        currentFilter: undefined,
        onApply: () => {},
      },
    });
    expect(filter.options()).toEqual(["EURUSD", "GBPUSD", "USDJPY"]);
    expect(filter.isChecked("EURUSD")).toBe(true);
    expect(filter.isChecked("USDJPY")).toBe(true);
  });

  it("pre-selects only the values from an existing filter", () => {
    const current: ColumnFilter = {
      type: "set",
      column: "currencyPair",
      values: new Set(["USDJPY"]),
    };
    const filter = mount(SetFilter, {
      props: {
        column: "currencyPair",
        trades,
        currentFilter: current,
        onApply: () => {},
      },
    });
    expect(filter.isChecked("USDJPY")).toBe(true);
    expect(filter.isChecked("EURUSD")).toBe(false);
  });

  it("emits a set filter of the selected values when not all are checked", async () => {
    let applied: ColumnFilter | null | undefined;
    const filter = mount(SetFilter, {
      props: {
        column: "currencyPair",
        trades,
        currentFilter: undefined,
        onApply: (f: ColumnFilter | null) => {
          applied = f;
        },
      },
    });
    await filter.toggle("EURUSD"); // deselect one
    await filter.apply();
    expect(applied).toMatchObject({ type: "set", column: "currencyPair" });
    expect(
      (applied as Extract<ColumnFilter, SetFilterTag>).values.has("EURUSD"),
    ).toBe(false);
    expect(
      (applied as Extract<ColumnFilter, SetFilterTag>).values.has("USDJPY"),
    ).toBe(true);
  });

  it("clears the filter (null) when all values are selected on apply", async () => {
    let called = false;
    let applied: ColumnFilter | null | undefined;
    const filter = mount(SetFilter, {
      props: {
        column: "currencyPair",
        trades,
        currentFilter: undefined,
        onApply: (f: ColumnFilter | null) => {
          called = true;
          applied = f;
        },
      },
    });
    await filter.apply(); // nothing toggled → all still selected
    expect(called).toBe(true);
    expect(applied).toBeNull();
  });

  it("re-checks a value after toggling it off and on", async () => {
    const filter = mount(SetFilter, {
      props: {
        column: "currencyPair",
        trades,
        currentFilter: undefined,
        onApply: () => {},
      },
    });
    await filter.toggle("EURUSD");
    expect(filter.isChecked("EURUSD")).toBe(false);
    await filter.toggle("EURUSD");
    expect(filter.isChecked("EURUSD")).toBe(true);
  });
});

type SetFilterTag = { type: "set" };

function trade(over: Partial<Trade> = {}): Trade {
  return {
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
  };
}
