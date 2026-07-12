import { CurrencyFilter } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

import type { CurrencyCategory } from "@rtc/domain";

describe("CurrencyFilter", () => {
  it("renders a button for every currency category", () => {
    const filter = mount(CurrencyFilter, {
      props: { selected: "All", onChange: () => {} },
    });
    expect(filter.categories()).toEqual([
      "All",
      "EUR",
      "USD",
      "GBP",
      "AUD",
      "NZD",
      "JPY",
      "CAD",
    ]);
  });

  it("marks the selected category as active", () => {
    const filter = mount(CurrencyFilter, {
      props: { selected: "EUR", onChange: () => {} },
    });
    expect(filter.selectedCategory()).toBe("EUR");
  });

  it("reports the chosen category to onChange", async () => {
    const chosen: CurrencyCategory[] = [];
    const filter = mount(CurrencyFilter, {
      props: {
        selected: "All",
        onChange: (c: CurrencyCategory) => {
          return chosen.push(c);
        },
      },
    });
    await filter.choose("JPY");
    expect(chosen).toEqual(["JPY"]);
  });

  it("moves the active highlight when the selected prop changes", () => {
    const filter = mount(CurrencyFilter, {
      props: { selected: "All", onChange: () => {} },
    });
    expect(filter.selectedCategory()).toBe("All");
    filter.setProps({ selected: "GBP" });
    expect(filter.selectedCategory()).toBe("GBP");
  });
});
