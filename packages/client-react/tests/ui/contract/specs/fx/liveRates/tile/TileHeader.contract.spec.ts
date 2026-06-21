import { TileHeader } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

describe("TileHeader", () => {
  it("renders the base and terms currencies separated by a slash", () => {
    const header = mount(TileHeader, { props: { base: "EUR", terms: "USD" } });
    expect(header.parts()).toEqual(["EUR", "/", "USD"]);
    expect(header.text()).toBe("EUR/USD");
  });

  it("re-renders when the currency pair changes", () => {
    const header = mount(TileHeader, { props: { base: "EUR", terms: "USD" } });
    header.setProps({ base: "GBP", terms: "JPY" });
    expect(header.parts()).toEqual(["GBP", "/", "JPY"]);
  });
});
