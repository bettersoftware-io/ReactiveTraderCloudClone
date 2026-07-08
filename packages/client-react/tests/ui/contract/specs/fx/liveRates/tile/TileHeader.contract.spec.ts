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

  // Before two history ticks exist the pip magnitude is unknown (not zero),
  // while the price's movementType can already be non-flat — rendering
  // "▲ 0 pip" would be misleading, so the badge stays hidden.
  it("hides the badge while the pip magnitude is still unknown", () => {
    const header = mount(TileHeader, {
      props: headerProps({
        movement: PriceMovementType.UP,
        movementPips: null,
      }),
    });
    expect(header.hasMovementBadge()).toBe(false);
    expect(header.movementText()).toBe("");
  });

  describe("compact ⚡ RFQ chip (RFQ init-state affordance)", () => {
    it("renders no chip when onInitiateRfq is not provided", () => {
      const header = mount(TileHeader, { props: headerProps() });
      expect(header.hasRfqChip()).toBe(false);
    });

    it("renders the chip with its glyph label and Initiate RFQ tooltip/name", () => {
      const header = mount(TileHeader, {
        props: headerProps({ onInitiateRfq: () => {} }),
      });
      expect(header.hasRfqChip()).toBe(true);
      expect(header.rfqChipText()).toBe("⚡ RFQ");
      expect(header.rfqChipTitle()).toBe("Initiate RFQ");
      expect(header.rfqChipAriaLabel()).toBe("Initiate RFQ");
    });

    it("fires onInitiateRfq when the chip is clicked", async () => {
      let initiated = 0;
      const header = mount(TileHeader, {
        props: headerProps({
          onInitiateRfq: () => {
            initiated += 1;
          },
        }),
      });
      await header.clickRfqChip();
      expect(initiated).toBe(1);
    });

    it("renders the movement badge and the chip side by side", () => {
      const header = mount(TileHeader, {
        props: headerProps({
          movement: PriceMovementType.UP,
          movementPips: 5,
          onInitiateRfq: () => {},
        }),
      });
      expect(header.movementText()).toBe("▲ 5 pip");
      expect(header.hasRfqChip()).toBe(true);
    });

    // PROTO parity: the chip slots in on the left, so the movement/pips badge
    // keeps its original far-right position whether or not the chip shows.
    it("renders the chip before the movement badge (badge keeps the far-right slot)", () => {
      const header = mount(TileHeader, {
        props: headerProps({
          movement: PriceMovementType.UP,
          movementPips: 5,
          onInitiateRfq: () => {},
        }),
      });
      expect(header.actionsOrder()).toEqual(["rfqChip", "movementBadge"]);
    });
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
