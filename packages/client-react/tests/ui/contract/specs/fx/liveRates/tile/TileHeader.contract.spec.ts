import { TileHeader } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import type { TileHeaderProps } from "@ui-contract/pages/fx/liveRates/tile/TileHeaderPage";
import { describe, expect, it } from "vitest";

import { PriceMovementType } from "@rtc/domain";

describe("TileHeader", () => {
  it("renders the base and terms currencies separated by a slash", () => {
    const header = mount(TileHeader, { props: headerProps() });
    expect(header.parts().slice(0, 3)).toEqual(["EUR", "/", "USD"]);
    expect(header.text()).toBe("EUR/USD");
  });

  it("re-renders when the currency pair changes", () => {
    const header = mount(TileHeader, { props: headerProps() });
    header.setProps({ base: "GBP", terms: "JPY" });
    expect(header.parts().slice(0, 3)).toEqual(["GBP", "/", "JPY"]);
  });

  it("renders the tiny symbol code", () => {
    const header = mount(TileHeader, {
      props: headerProps({ symbol: "EURUSD" }),
    });
    expect(header.symbolCode()).toBe("EURUSD");
  });

  it("shows an up arrow and pip count when the price ticked up", () => {
    const header = mount(TileHeader, {
      props: headerProps({
        movement: PriceMovementType.UP,
        movementPips: 5,
      }),
    });
    expect(header.movementText()).toBe("▲ 5 pip");
    expect(header.movementKey()).toBe("up");
  });

  it("shows a down arrow and pip count when the price ticked down", () => {
    const header = mount(TileHeader, {
      props: headerProps({
        movement: PriceMovementType.DOWN,
        movementPips: 3,
      }),
    });
    expect(header.movementText()).toBe("▼ 3 pip");
    expect(header.movementKey()).toBe("down");
  });

  it("shows a neutral badge when there is no movement", () => {
    const header = mount(TileHeader, {
      props: headerProps({ movement: PriceMovementType.NONE, movementPips: 0 }),
    });
    expect(header.movementText()).toBe("– 0 pip");
    expect(header.movementKey()).toBe("flat");
  });
});

function headerProps(over: Partial<TileHeaderProps> = {}): TileHeaderProps {
  return {
    base: "EUR",
    terms: "USD",
    symbol: "EURUSD",
    movement: PriceMovementType.NONE,
    movementPips: 0,
    ...over,
  };
}
