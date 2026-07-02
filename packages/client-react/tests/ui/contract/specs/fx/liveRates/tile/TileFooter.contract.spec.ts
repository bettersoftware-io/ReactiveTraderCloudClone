import { TileFooter } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

describe("TileFooter", () => {
  it("renders the spot date on the left", () => {
    const footer = mount(TileFooter, {
      props: { spotDate: "04 Jul", notional: "1,000,000", baseCurrency: "EUR" },
    });
    expect(footer.spotDateText()).toBe("SPT 04 Jul");
  });

  it("renders the notional and base currency on the right", () => {
    const footer = mount(TileFooter, {
      props: { spotDate: "04 Jul", notional: "1,000,000", baseCurrency: "EUR" },
    });
    expect(footer.notionalText()).toBe("1,000,000 EUR");
  });

  it("re-renders when the notional changes", () => {
    const footer = mount(TileFooter, {
      props: { spotDate: "04 Jul", notional: "1,000,000", baseCurrency: "EUR" },
    });
    footer.setProps({ notional: "2,500,000" });
    expect(footer.notionalText()).toBe("2,500,000 EUR");
  });
});
